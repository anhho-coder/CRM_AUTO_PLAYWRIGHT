import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION (extended) - CRM-10066
 *  Manual merge via "Convert to Opportunity" - POSITIVE: merge into TWO Opps
 * =============================================================================
 *  Test Case ID     : CRM-10066_2.2
 *  Jira             : CRM-10066  (extended coverage around the manual-merge flow)
 *  Automation-Type  : new
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - derived from CRM-10066 verification (positive aspect)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Positive variant: a Lead is merged into TWO existing Opportunities at once (two "Add a line"
 *  selections). Verifies the master Opportunity absorbs BOTH the Lead and the second Opp -
 *  its log records "Merged lead : <Lead#1>" AND "Merged lead : <Opp#2>", Stage New.
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_2\.2:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (scenario steps - same order):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1 (Sale Team CMR) and Opp #2 (Sale Team EAM), both:
 *       - Email  = "multi-test-hot@<domain>"   (same domain, unique per run)
 *       - Lead Form = License, Company = test123, Address 123street / United States / Texas (US)
 *  2. Create Lead #1 (Sale Team IBSA) with the same domain email "lead-test-hot@<domain>",
 *       Lead Form = IB NC Leads, Company = test123.
 *  3. Select Lead#1, press "Convert to Opportunity"
 *  4. Select option "Merge with existing opportunities"
 *  5. "Add a line" -> add Opp#1 (Sale Team CMR); "Add a line" again -> add Opp#2 (Sale Team EAM)
 *  6. Press "CREATE OPPORTUNITY"
 *  7. Observe result
 *
 *  Expected Result : The Merging completes into ONE master Opportunity which records BOTH merged
 *                    records ("Merged lead : <Lead#1>" and "Merged lead : <Opp#2>"), Stage New.
 *
 *  Verify: Step 7 prints an explicit VERIFY block (Expected/Actual/Result per check + OVERALL).
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting created/merged Opportunities
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the created Lead

test.describe('CRM-10066_2.2 - Manual merge (Convert to Opportunity) into two Opportunities completes', () => {

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
      console.log(`Cleanup: deleting Lead ${lead1Url} (may already be merged/inactive)`);
      await CommonUtils.deleteRecordByUrl(page, lead1Url, testInfo).catch(() => {});
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test('CRM-10066_2.2: Verify a Lead can be manually merged into two existing Opportunities via "Convert to Opportunity"', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_2.2';
    const uid = CommonUtils.generateUniqueId().replace(/_/g, '');
    const sharedDomain = `ap14test${uid}.com`;
    const opp1Email = `opp1-test-hot@${sharedDomain}`;
    const opp2Email = `opp2-test-hot@${sharedDomain}`;
    const leadEmail = `lead-test-hot@${sharedDomain}`;
    const companyName = `test123-${uid}`;
    const opp1Name = `TEST Opp 1 ${tcId} ${uid}`;
    const opp2Name = `TEST Opp 2 ${tcId} ${uid}`;
    const lead1Name = `TEST Lead 1 ${tcId} ${uid}`;
    const opp1Team = 'CMR';
    const opp2Team = 'EAM';
    const lead1Team = 'IBSA';

    let opp1Url = '';

    // Local helper: create an Opportunity with the given name/email/team (test-flow code, page-object methods only).
    // Always returns to the CRM Opportunities list first (via the apps menu) so it works from ANY page -
    // including from a just-saved Opp form (switching to list directly from a form view times out).
    const createOpp = async (name: string, email: string, team: string): Promise<string> => {
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
      await opportunityPage.fillOpportunityName(name);
      await opportunityPage.fillEmail(email);
      await opportunityPage.fillCompanyName(companyName);
      await opportunityPage.fillStreet('123street');
      await opportunityPage.selectCountry('United States');
      await opportunityPage.selectState('Texas');
      await opportunityPage.selectSalesTeam(team);
      console.log(`  - Opp name      : ${name}`);
      console.log(`  - Email         : ${email}`);
      console.log(`  - Company Name  : ${companyName}`);
      console.log(`  - Sale Team     : ${team}`);
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('License');
      console.log(`  - Lead Form     : License`);
      await opportunityPage.saveAndWaitForCompletion();
      const id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      const url = page.url();
      console.log(`OK - ${name} saved (ID: ${id})`);
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);
      return url;
    };

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

    await test.step('Step 1: Create Opp#1 (Sale Team CMR) and Opp#2 (Sale Team EAM)', async () => {
      console.log('Step 1a: Creating Opp#1 (CMR)');
      opp1Url = await createOpp(opp1Name, opp1Email, opp1Team);
      createdOppUrls.push(opp1Url);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Opp#1 created');

      console.log('Step 1b: Creating Opp#2 (EAM)');
      const opp2Url = await createOpp(opp2Name, opp2Email, opp2Team);
      createdOppUrls.push(opp2Url);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Opp#2 created');
    });

    await test.step('Step 2: Create Lead#1 (Sale Team IBSA, same domain)', async () => {
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

    await test.step('Step 4: Select option "Merge with existing opportunities"', async () => {
      console.log('Step 4: Selecting "Merge with existing opportunities"');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      console.log(`  - "Merge with existing opportunities" option available: ${mergeAvailable}`);
      expect(mergeAvailable, '"Merge with existing opportunities" should be offered (shared domain)').toBeTruthy();
      await leadPage.selectConversionActionMerge();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge option selected');
      console.log('OK - Conversion Action set to "Merge with existing opportunities"');
    });

    await test.step('Step 5: Add Opp#1 (CMR) and Opp#2 (EAM) to the merge list', async () => {
      console.log(`Step 5a: Adding Opp#1 (Sale Team ${opp1Team}) by email ${opp1Email}`);
      const pick1 = await leadPage.addOpportunityToMergeByEmailAndTeam(opp1Email, opp1Team);
      console.log(`  - Opp#1 selected by Sales Team: ${pick1.selectedByTeam} (rows: ${pick1.rowCount})`);
      expect(pick1.selectedByTeam, `Opp#1 (Sales Team ${opp1Team}) should be selectable in the picker`).toBeTruthy();

      console.log(`Step 5b: Adding Opp#2 (Sale Team ${opp2Team}) by email ${opp2Email}`);
      const pick2 = await leadPage.addOpportunityToMergeByEmailAndTeam(opp2Email, opp2Team);
      console.log(`  - Opp#2 selected by Sales Team: ${pick2.selectedByTeam} (rows: ${pick2.rowCount})`);
      expect(pick2.selectedByTeam, `Opp#2 (Sales Team ${opp2Team}) should be selectable in the picker`).toBeTruthy();

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Both Opps added to merge list');
      console.log('OK - Opp#1 and Opp#2 added to the merge list');
    });

    await test.step('Step 6: Press "CREATE OPPORTUNITY"', async () => {
      console.log('Step 6: Clicking "CREATE OPPORTUNITY" to perform the merge');
      await leadPage.clickCreateOpportunity();
      createdOppUrls.push(page.url());
      console.log(`OK - Merge submitted (resulting Opportunity URL: ${page.url()})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    await test.step('Step 7: Observe result - the Merging is completed into one master Opp', async () => {
      console.log('Step 7: Verifying both records merged into Opp#1 (the master)');
      console.log(`  - Opening Opp#1: ${opp1Url}`);
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // Get the chatter once (reload-and-retry until the Lead#1 merge note appears), then check both notes in it.
      const leadMerge = await opportunityPage.waitForChatterContaining(`Merged lead : ${lead1Name}`, 3, CommonUtils.waitTimes.long);
      // A merged OPPORTUNITY is logged as "Merged opportunity : <name>" (a merged LEAD uses "Merged lead : <name>").
      const opp2Merged = leadMerge.chatterText.includes(`Merged opportunity : ${opp2Name}`);
      const stageNewVisible = await opportunityPage.isStageNewVisible();
      console.log(`  - Opp#1 log shows "Merged lead : Lead#1": ${leadMerge.found}`);
      console.log(`  - Opp#1 log shows "Merged opportunity : Opp#2" : ${opp2Merged}`);
      console.log(`  - Opp#1 shows Stage "New"               : ${stageNewVisible}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge completed (Opp#1 master result)');

      console.log('==================== VERIFY ====================');
      console.log('  Verify #1 - Master Opp records the merged Lead#1:');
      console.log(`     Expected (contains) : "Merged lead : ${lead1Name}"`);
      console.log(`     Actual (found)      : ${leadMerge.found ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result              : ${leadMerge.found ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #2 - Master Opp records the merged Opp#2:');
      console.log(`     Expected (contains) : "Merged opportunity : ${opp2Name}"`);
      console.log(`     Actual (found)      : ${opp2Merged ? 'FOUND' : 'NOT FOUND'}`);
      console.log(`     Result              : ${opp2Merged ? 'PASS' : 'FAIL'}`);
      console.log('  Verify #3 - Master Opp still shows Stage "New":');
      console.log('     Expected            : Stage "New" visible = true');
      console.log(`     Actual              : Stage "New" visible = ${stageNewVisible}`);
      console.log(`     Result              : ${stageNewVisible ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');

      expect(leadMerge.found, `Verify #1 FAILED - master Opp should record "Merged lead : ${lead1Name}"`).toBeTruthy();
      expect(opp2Merged, `Verify #2 FAILED - master Opp should record "Merged opportunity : ${opp2Name}"`).toBeTruthy();
      expect(stageNewVisible, 'Verify #3 FAILED - master Opp should still show Stage "New"').toBeTruthy();
      console.log('OVERALL: PASS - Lead merged into two Opportunities successfully');
    });
  });
});
