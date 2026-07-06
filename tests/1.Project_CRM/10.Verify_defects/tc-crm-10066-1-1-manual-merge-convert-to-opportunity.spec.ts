import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================
 *  DEFECT VERIFICATION - CRM-10066
 *  Cannot make manual merging using "Convert to Opportunity" option
 * =============================================================================
 *  Test Case ID     : CRM-10066_1.1
 *  Jira             : CRM-10066  (Bug [Maintenance], Critical (P2), status Resolved)
 *  Automation-Type  : refactored
 *  Automation-Date  : 2026-07-06
 *  Test Repository  : N/A - defect verification (bug has no Xray manual steps; steps taken from the bug description)
 * -----------------------------------------------------------------------------
 *  Summary:
 *  Reproduces the manual merge flow from CRM-10066: create Opp#1 and a Lead that share the same
 *  company DOMAIN (different local-parts) and Company Name, then on the Lead use "Convert to Opportunity"
 *  -> "Merge with existing opportunities" -> add Opp#1 by its email -> "CREATE OPPORTUNITY". Verifies the
 *  merge COMPLETES (bug's expected result): the resulting Opportunity shows Stage "New" and its log records
 *  the Lead "has been merged into this lead".
 *
 *  Command to run:
 *    npx playwright test --grep "CRM-10066_1\.1:" --project=chromium
 *    npx playwright test --grep "CRM-10066" --project=chromium
 * -----------------------------------------------------------------------------
 *  Source manual TC (from the CRM-10066 description - same order, verbatim):
 *
 *  Pre-condition: On Pre-production, login and open CRM.
 *
 *  1. Create Opp #1 having:
 *       - Email address = "Opp-test-hot@<shared company domain>"   (unique per run)
 *       - Lead Form     = License
 *       - Company Name  = test123                                  (unique per run)
 *       - Street        = 123street
 *       - Country       = United States
 *       - State         = Texas (US)
 *       - Sale Team     = CMR
 *       - Status        = NEW
 *
 *  2. Create Lead #1 having:
 *       - Email address = "lead-test-hot@<same company domain as Opp#1>"   (unique per run)
 *       - Lead Form     = IB NC Leads
 *       - Company Name  = test123                                          (same as Opp#1)
 *       - Street        = 123street
 *       - Country       = United States
 *       - State         = Texas (US)
 *       - Sale Team     = IBSA
 *
 *  3. Select Lead#1, press "Convert to Opportunity" button
 *  4. Select option "Merge with existing opportunities"
 *  5. Select "Add a line" and filter all Opp with Email = "Opp-test-hot@<shared domain>"
 *  6. Select the Opp#1, then press "CREATE OPPORTUNITY" finally
 *  7. Observe result
 *
 *  Expected Result : The Merging will complete.
 *  Observed (bug)  : The Merging did not happen.
 *
 *  Note on numbering: the bug lists two "5." entries; they are mapped here to Step 5 (Add a line + filter by
 *  email) and Step 6 (Select Opp#1 + CREATE OPPORTUNITY). The bug's "6. Observe result" is the Verification (Step 7).
 *
 *  Note on data (REQUIREMENT #2 - independent, fresh data each run): the hard-coded emails/company from the
 *  bug are replaced with per-run unique values. The Opp and the Lead deliberately SHARE one unique company
 *  DOMAIN (only the local-part differs), because that shared domain is what makes Odoo offer the
 *  "Merge with existing opportunities" option - exactly as in the original bug's emails
 *  ("Opp-test-hot@ap14-0216test.com" vs "lead-test-hot@ap14-0216test.com").
 * =============================================================================
 */

const SKIP_CLEANUP_OPP = false;  // Toggle to true to skip deleting the created/merged Opportunity
const SKIP_CLEANUP_LEAD = false; // Toggle to true to skip deleting the created Lead

test.describe('CRM-10066_1.1 - Manual merge via "Convert to Opportunity" option completes', () => {

  const createdOppUrls: string[] = [];
  let lead1Url = '';

  test.beforeEach(async ({ context, page }) => {
    // Clear cookies to ensure a fresh session
    await context.clearCookies();
    // Deny geolocation permission to prevent the "Know your location" popup
    await context.grantPermissions([]);
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    // NOTE: no boundary screenshot here on purpose - the page is still about:blank after a cookie
    // clear, so a capture would add no value (see "screenshot only when UI present" convention).
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If the test failed, let Odoo loading spinners settle before Playwright's auto-screenshot
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

    // Cleanup: delete the merged/created Opportunity, then the Lead (guarded - the Lead may already be
    // merged/inactive). Both are best-effort so teardown never fails the test.
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

    // Boundary screenshot (REQUIREMENT #3): final state of afterEach, guarded so it never throws
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  // Skipped by request due to bug CRM-10066 (declaration-level skip so fixtures never launch the browser).
  // NOTE: this test currently PASSES - CRM-10066 was verified fixed on 2026-07-03 (the manual merge completes:
  // Opp#1 gets a "Merged lead : <Lead>" log note + "Merged Leads" smart button). Re-enable by changing
  // `test.skip(` back to `test(` when the skip is no longer wanted.
  test.skip('CRM-10066_1.1: Verify manual merging using "Convert to Opportunity" option completes successfully', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

    const tcId = 'CRM-10066_1.1';

    // --- Per-run unique data (REQUIREMENT #2) ---
    // One shared, unique, NON-public company domain drives Odoo's "Merge with existing opportunities"
    // detection; only the email local-part differs between the Opp and the Lead (as in the original bug).
    const uid = CommonUtils.generateUniqueId().replace(/_/g, ''); // digits only -> valid in a domain
    const sharedDomain = `ap14test${uid}.com`;
    const oppEmail = `opp-test-hot@${sharedDomain}`;
    const leadEmail = `lead-test-hot@${sharedDomain}`;
    const companyName = `test123-${uid}`;
    const opp1Name = `TEST Opp 1 ${tcId} ${uid}`;
    const lead1Name = `TEST Lead 1 ${tcId} ${uid}`;
    const opp1Team = 'CMR';   // Opp#1 Sale Team (per the bug); also used to pick Opp#1 in the merge picker
    const lead1Team = 'IBSA'; // Lead#1 Sale Team (per the bug)

    let opp1Url = '';

    // Pre-condition: Login and open CRM
    await test.step('Pre-condition: Login and open CRM', async () => {
      console.log('Pre-condition: Logging in and navigating to CRM');
      console.log(`  - Shared company domain : ${sharedDomain}`);
      console.log(`  - Opp#1 email           : ${oppEmail}`);
      console.log(`  - Lead#1 email          : ${leadEmail}`);
      console.log(`  - Company Name (shared) : ${companyName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('OK - Logged in and CRM opened');
    });

    // Step 1 (Pre-condition I): Create Opp#1
    await test.step('Step 1: Create Opp#1 (Email, Lead Form=License, Company=test123, Address, Sale Team=CMR, Status=NEW)', async () => {
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
      console.log(`  - Street        : 123street`);
      console.log(`  - Country       : United States`);
      console.log(`  - State         : Texas (US)`);
      console.log(`  - Sale Team     : ${opp1Team}`);
      console.log(`  - Status        : NEW (default stage for a new Opportunity)`);

      // Lead Form is on the "CRM Developer" tab
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('License');
      console.log(`  - Lead Form     : License`);

      await opportunityPage.saveAndWaitForCompletion();
      const opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      createdOppUrls.push(opp1Url);
      console.log(`OK - Opp#1 saved (ID: ${opp1Id})`);

      // Give Odoo time to create the background Contact/partner from the email
      console.log('  - Waiting for the background Contact to be created...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition I - Opp#1 created (ID: ${opp1Id})`);
    });

    // Step 2 (Pre-condition II): Create Lead#1 (same Company Name + same domain, different email)
    await test.step('Step 2: Create Lead#1 (Email same-domain, Lead Form=IB NC Leads, Company=test123, Address, Sale Team=IBSA)', async () => {
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
      console.log(`  - Street        : 123street`);
      console.log(`  - Country       : United States`);
      console.log(`  - State         : Texas (US)`);
      console.log(`  - Sale Team     : ${lead1Team}`);

      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form     : IB NC Leads`);

      await leadPage.clickSave();
      await leadPage.waitForSaveComplete();
      const lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`OK - Lead#1 saved (ID: ${lead1Id})`);

      // Give Odoo time to create the background Contact/partner from the email
      console.log('  - Waiting for the background Contact to be created...');
      await page.waitForTimeout(CommonUtils.waitTimes.contactCreationWait);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Pre-condition II - Lead#1 created (ID: ${lead1Id})`);
    });

    // Step 3: Select Lead#1, press "Convert to Opportunity" (we are already on Lead#1's form)
    await test.step('Step 3: Select Lead#1, press "Convert to Opportunity" button', async () => {
      console.log('Step 3: Clicking "Convert to Opportunity" on Lead#1');
      await leadPage.clickConvertToOpportunity();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Convert wizard opened');
      console.log('OK - Conversion wizard opened');
    });

    // Step 4: Select "Merge with existing opportunities"
    await test.step('Step 4: Select option "Merge with existing opportunities"', async () => {
      console.log('Step 4: Selecting "Merge with existing opportunities"');
      const mergeAvailable = await leadPage.isMergeOptionAvailable();
      console.log(`  - "Merge with existing opportunities" option available: ${mergeAvailable}`);
      expect(
        mergeAvailable,
        '"Merge with existing opportunities" should be offered (Opp#1 and Lead#1 share the same company email domain)'
      ).toBeTruthy();

      await leadPage.selectConversionActionMerge();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge option selected');
      console.log('OK - Conversion Action set to "Merge with existing opportunities"');
    });

    // Step 5: Add a line and filter Opportunities by Opp#1 email, then select Opp#1 by its unique name
    await test.step('Step 5: Select "Add a line" and filter all Opp with Email = Opp#1 email', async () => {
      console.log(`Step 5: Adding Opp#1 to the merge list (filter by email: ${oppEmail}; select by Sales Team: ${opp1Team})`);
      const pick = await leadPage.addOpportunityToMergeByEmailAndTeam(oppEmail, opp1Team);
      console.log(`  - Opportunities matched by the email filter : ${pick.rowCount}`);
      console.log(`  - Opp#1 row selected by its Sales Team       : ${pick.selectedByTeam}`);
      expect(pick.selectedByTeam, `Opp#1 (Sales Team ${opp1Team}) should be found and selected in the "Add: Opportunities" picker`).toBeTruthy();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Opp#1 added to merge list');
      console.log('OK - Opp#1 added to the merge list');
    });

    // Step 6: Select the Opp#1, then press "CREATE OPPORTUNITY"
    await test.step('Step 6: Select the Opp#1, then press "CREATE OPPORTUNITY"', async () => {
      console.log('Step 6: Clicking "CREATE OPPORTUNITY" to perform the merge');
      await leadPage.clickCreateOpportunity();
      const mergedOppUrl = page.url();
      createdOppUrls.push(mergedOppUrl);
      console.log(`OK - Merge submitted (resulting Opportunity URL: ${mergedOppUrl})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - CREATE OPPORTUNITY clicked');
    });

    // Step 7: Observe result - the merge is completed (verify on Opp#1, the surviving master opportunity)
    await test.step('Step 7: Observe result - the Merging is completed', async () => {
      console.log('Step 7: Verifying the merge completed on Opp#1 (the surviving master opportunity)');
      console.log(`  - Opening Opp#1: ${opp1Url}`);
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      // (a) Opp#1's log records the merged lead - the definitive "merge completed" signal. This customized
      //     NAKIVO Odoo posts "Merged lead : <Lead name>" (and shows a "Merged Leads" smart button),
      //     not the stock Odoo "<Lead>, has been merged into this lead". Reload-and-retry as it posts on submit.
      const mergeLog = await opportunityPage.waitForChatterContaining(
        `Merged lead : ${lead1Name}`,
        3,
        CommonUtils.waitTimes.long
      );
      console.log(`  - Opp#1 log shows "Merged lead : Lead#1": ${mergeLog.found}`);

      // (b) Opp#1 remained an Opportunity at Stage "New" after absorbing Lead#1
      const stageNewVisible = await opportunityPage.isStageNewVisible();
      console.log(`  - Opp#1 shows Stage "New": ${stageNewVisible}`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Merge completed (Opp#1 result)');

      // ===== VERIFY ===== (expected vs actual for each verification point, then assert)
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

      expect(
        mergeLog.found,
        `Verify #1 FAILED - Opp#1 log should record "Merged lead : ${lead1Name}" (CRM-10066 fixed - manual merge completed)`
      ).toBeTruthy();
      expect(stageNewVisible, 'Verify #2 FAILED - Opp#1 should still show Stage "New" after the merge').toBeTruthy();

      console.log('OVERALL: PASS - Manual merge via "Convert to Opportunity" completed successfully (CRM-10066 fixed)');
    });
  });
});
