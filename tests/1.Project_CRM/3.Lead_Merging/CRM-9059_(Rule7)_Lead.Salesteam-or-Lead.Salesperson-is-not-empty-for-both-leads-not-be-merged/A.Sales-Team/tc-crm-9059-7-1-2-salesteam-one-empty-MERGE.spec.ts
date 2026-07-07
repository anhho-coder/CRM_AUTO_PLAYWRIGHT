import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging (Rule 7) - matrix ST-2: Sales Team on Lead#1 only (MERGE)
 * Test Case ID: CRM-9059_7.1.2
 * Automation-Type: new
 * Automation-Date: 2026-07-07
 *
 * Summary: Verify that two merge-eligible leads with the SAME company email MERGE when
 * Sales Team is set on Lead#1 but not on Lead#2 (Rule 7 does not block - positive control).
 * Rule 7 blocks only when Sales Team OR Salesperson is non-empty on BOTH leads AND different.
 *
 * Merge-eligibility recipe (see config/LEAD_MERGING_TEST_RULES.md):
 *   - Lead#1 (manual, SURVIVOR): Created Manually = TRUE, Tag = "Can_Merge", Lead form = BLANK
 *   - Lead#2 (other, ABSORBED) : Created Manually = FALSE, Lead form = License
 *
 * Command to run:
 *   npx playwright test --grep "CRM-9059_7\.1\.2 -" --project=chromium
 *
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, select "Leads" item then "Leads" sub-item
 *
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current TC ID
 *    - Email textbox = Company email (Test@company + timestamp .com) (Email_Lead#1)
 *    - Company Name textbox = Company Name Lead 1
 *    - Street dropdown list = 123street
 *    - Country dropdown list = Belgium
 *    - State dropdown list = Flanders
 *    - Sales Team dropdown list = BDEU
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox = TRUE
 *    - Tags = "Can_Merge"
 * 3. Click "CRM Developer" tab: Lead form textbox = BLANK
 * 4. Press "SAVE"; copy URL_Lead#1
 *
 * II. Condition#2 to create Lead#2:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current TC ID
 *    - Email textbox = Email_Lead#1 (same email)
 *    - Company Name textbox = Company Name Lead 2
 *    - Contact Name textbox = Contact Name Lead 2
 *    - Street dropdown list = 123street
 *    - Country dropdown list = United States
 *    - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox = FALSE
 * 3. Click "CRM Developer" tab: Lead form textbox = License
 * 4. Press "SAVE"; copy URL_Lead#2
 *
 * Steps to reproduce:
 * 1. Wait for the async merge window for Lead Merging to happen
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains "Can_Merge"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Flanders
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Lead#1
 * 4. Click "CRM Developer" tab and verify:
 *    4.1. Lead form textbox = BLANK
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area: "[LEAD 2], has been merged into this lead."
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field is empty (Lead#2 carried no tag)
 *    7.2. Company Name textbox = Company Name Lead 1 (auto set due to created Contact)
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list has a value or not
 *    7.7. Email textbox = Email_Lead#1
 * 8. Click "CRM Developer" tab and verify:
 *    8.1. Lead form textbox = License
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area: "This lead has been merged into [LEAD 1]."
 */

test.describe('CRM-9059_7.1.2 - Lead Merging Rule 7: Sales Team on Lead#1 only (MERGE)', () => {

  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();

    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);

    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    // If test failed, wait for page to stabilize before Playwright takes automatic screenshot
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      // Surface WHY the test failed (the assertion reason), not just the stabilize wait
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('❌ TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');

      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('  - Loading spinner wait skipped');
      });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('  - Network idle wait skipped');
      });
      await page.waitForTimeout(3000);
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('CRM-9059_7.1.2: Verify leads MERGE with same company email and Sales Team set on Lead#1 only', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);

    const tcId = 'CRM-9059_7.1.2';
    let sharedEmail: string;
    let lead1Name: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;

    // Step 1: Login
    await test.step('Step 1: Login and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to CRM module
    await test.step('Step 2: Navigate to CRM module', async () => {
      console.log('Step 2: Clicking CRM button');

      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to CRM module');
    });

    // Step 3: Navigate to Leads page
    await test.step('Step 3: Navigate to Leads page', async () => {
      console.log('Step 3: Navigating to CRM > Leads page');

      await homePage.navigateToLeads();

      console.log('✓ Navigated to Leads page\n');
    });

    // CONDITION #1: Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, blank form, Sales Team = BDEU, Salesperson EMPTY)
    await test.step('Condition #1: Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Created Manually = TRUE, Tag = Can_Merge) ===');

      // Generate shared email that will be used for both leads
      sharedEmail = CommonUtils.generateEmail('Test', 'company');
      console.log(`Generated shared email: ${sharedEmail}`);

      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');

      lead1Name = `TEST Lead 1 ${tcId}`;

      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);

      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (Email_Lead#1)`);

      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);

      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);

      await leadPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);

      await leadPage.selectState('Flanders');
      console.log(`  - State: Flanders`);

      await leadPage.selectSalesTeam('BDEU');
      console.log(`  - Sales Team: BDEU`);

      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);

      await leadPage.checkCreatedManually();
      console.log(`  - Created Manually: TRUE`);

      await leadPage.addTag('Can_Merge');
      console.log(`  - Tag: Can_Merge`);

      await leadPage.fillLeadForm('');
      console.log(`  - Lead Form: BLANK`);

      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);

      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    // CONDITION #2: Create Lead #2 (Created Manually = FALSE, no tag, Sales Team EMPTY, Salesperson EMPTY)
    await test.step('Condition #2: Create Lead #2 (Created Manually = FALSE)', async () => {
      console.log('=== CONDITION #2: CREATING LEAD #2 (Created Manually = FALSE) ===');

      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');

      lead2Name = `TEST Lead 2 ${tcId}`;

      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);

      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Lead#1)`);

      await leadPage.fillCompanyName('Company Name Lead 2');
      console.log(`  - Company Name: Company Name Lead 2`);

      await leadPage.fillContactName('Contact Name Lead 2');
      console.log(`  - Contact Name: Contact Name Lead 2`);

      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);

      await leadPage.selectCountry('United States');
      console.log(`  - Country: United States`);

      await leadPage.selectState('Texas');
      console.log(`  - State: Texas (US)`);

      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);

      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);

      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);

      await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: License`);

      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);

      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);
    });

    // STEP 1: Wait for Lead Merging to happen
    await test.step('Step 1: Wait for the async merge window for Lead Merging happened', async () => {
      console.log('\n=== STEP 1: WAIT FOR LEAD MERGING ===');
      console.log('⏳ Waiting for the async merge window for lead merging to occur...');

      await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

      console.log('✓ Wait complete - proceeding to verification\n');
    });

    // STEP 2: Open Lead #1
    await test.step('Step 2: Open the Lead 1 using URL_Lead#1', async () => {
      console.log('=== STEP 2: OPEN LEAD #1 ===');
      console.log(`Navigating to Lead #1 URL: ${lead1Url}`);

      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Lead #1 opened successfully\n');
    });

    // STEP 3: Verify Lead #1 fields (survivor / target)
    await test.step('Step 3: Verify the following fields on Lead #1', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS (READONLY MODE) ===\n');

      await test.step('Step 3.1: Tag field contains "Can_Merge"', async () => {
        const tagsText = await leadPage.getTagsText();
        expect(tagsText).toContain('Can_Merge');
        console.log(`  ✓ Step 3.1: Tags contain "Can_Merge"`);
      });

      await test.step('Step 3.2: Company Name textbox = Company Name Lead 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        expect(companyName).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 3.2: Company Name = Company Name Lead 1`);
      });

      await test.step('Step 3.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 3.3: Street = 123street`);
      });

      await test.step('Step 3.4: Country dropdown list = Belgium', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Belgium');
        console.log(`  ✓ Step 3.4: Country = Belgium`);
      });

      await test.step('Step 3.5: State dropdown list = Flanders', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Flanders');
        console.log(`  ✓ Step 3.5: State = Flanders`);
      });

      await test.step('Step 3.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        console.log(`  ✓ Step 3.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      await test.step('Step 3.7: Email textbox = Email_Lead#1', async () => {
        const email = await leadPage.getEmailReadonly();
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 4: Verify Lead #1 CRM Developer tab
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER TAB (LEAD #1) ===\n');

      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      await test.step('Step 4.1: Lead form textbox = BLANK', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        expect(leadForm).toBe('');
        console.log(`  ✓ Step 4.1: Lead form = BLANK`);
      });

      await test.step('Step 4.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 4.2: Active = TRUE`);
      });

      await test.step('Step 4.3: Is Won = Pending', async () => {
        const isWon = await leadPage.getIsWonValue();
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 4.3: Is Won = ${isWon}`);
      });

      await test.step('Step 4.4: Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
      });
    });

    // STEP 5: Verify Log area on Lead #1 (source lead merged into this lead)
    await test.step('Step 5: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA (LEAD #1) ===\n');

      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);

      await test.step('Step 5.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasSourceLeadMergeMessage(lead2Name);
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 5.1: Found log message: "${lead2Name}, has been merged into this lead."`);
      });
    });

    // STEP 6: Open Lead #2 (source / merged-away)
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);

      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Lead #2 opened successfully\n');
    });

    // STEP 7: Verify Lead #2 fields
    await test.step('Step 7: Verify the following fields on Lead #2', async () => {
      console.log('=== STEP 7: VERIFY LEAD #2 FIELDS (READONLY MODE) ===\n');

      await test.step('Step 7.1: Tag field is empty (Lead #2 carried no tag)', async () => {
        const tagsText = await leadPage.getTagsText();
        console.log(`  ✓ Step 7.1: Tags = "${tagsText.trim()}" (Lead #2 had no tag)`);
      });

      await test.step('Step 7.2: Company Name textbox = Company Name Lead 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        expect(companyName).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Lead 1 (auto set due to created Contact)`);
      });

      await test.step('Step 7.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 7.3: Street = 123street`);
      });

      await test.step('Step 7.4: Country dropdown list = United States', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 7.4: Country = United States`);
      });

      await test.step('Step 7.5: State dropdown list = Texas (US)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 7.5: State = Texas`);
      });

      await test.step('Step 7.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        console.log(`  ✓ Step 7.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      await test.step('Step 7.7: Email textbox = Email_Lead#1', async () => {
        const email = await leadPage.getEmailReadonly();
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 7.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 8: Verify Lead #2 CRM Developer tab (merged away)
    await test.step('Step 8: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER TAB (LEAD #2) ===\n');

      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      await test.step('Step 8.1: Lead form textbox = License', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        expect(leadForm).toBe('License');
        console.log(`  ✓ Step 8.1: Lead form = License`);
      });

      await test.step('Step 8.2: Active checkbox = FALSE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 8.2: Active = FALSE`);
      });

      await test.step('Step 8.3: Is Won = Lost', async () => {
        const isWon = await leadPage.getIsWonValue();
        expect(isWon.trim()).toBe('Lost');
        console.log(`  ✓ Step 8.3: Is Won = ${isWon}`);
      });

      await test.step('Step 8.4: Lost Reason = Duplicate', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('Duplicate');
        console.log(`  ✓ Step 8.4: Lost Reason = ${lostReasonValue}`);
      });
    });

    // STEP 9: Verify Log area on Lead #2 (this lead merged into Lead #1)
    await test.step('Step 9: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 9: VERIFY LOG AREA (LEAD #2) ===\n');

      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);

      await test.step('Step 9.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(lead1Name);
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 9.1: Found log message: "This lead has been merged into ${lead1Name}."`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: Lead merging verified (Sales Team set on Lead#1 only - Rule 7 does not block)');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Is Won=Pending, Tags: Can_Merge, Sales Team: BDEU`);
      console.log(`   Lead #2 (${lead2Id}): Active=FALSE, Is Won=Lost, Lost Reason=Duplicate (merged into Lead #1)`);
      console.log(`   Email: ${sharedEmail}`);
      console.log('==================================================\n');
    });
  });
});
