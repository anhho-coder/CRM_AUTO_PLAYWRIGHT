import { test, expect, Page, TestInfo } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Company Email with Different Priority (Deal Registration)
 * Test Case ID: CRM-1992_1.1.1.1.1
 * 
 * Summary: Verify that the merging lead happens successfully when the leads with the same 
 * company email but different priority if a lower priority lead is created manually and has tag "can_merge" 
 * and the higher priority lead has Lead form = Download Free Trial
 * 
 * Command to run:
 * npx playwright test --grep "CRM-1992_1\.1\.1\.1\.1 -" --project=chromium
 * npx playwright test --grep "CRM-10787" --project=chromium
 *
 * NOTE: Un-skipped for CRM-10787 fix-verification pilot (bug Resolved 2026-06-04).
 * NOTE: Skipped 2026-11-02 - blocked by CRM-14070 (Deal Registration not cloned Source -> Target since 16-Oct-2026).
 *       Remove the test.skip() and the [CRM-14070] title tag once CRM-14070 is resolved.
 *
 * Refactor 2026-11-02 (tester's request, side-by-side with CRM-12370_9.2.1 on crm-mig): Steps 3-9 run through
 * verifyChecks() - every verification point is a soft assertion (a FAIL no longer hides the later steps), each step
 * attaches one verify-evidence shot (VERIFY banner + outlined fields), fields are read where the form shows them
 * (readVisibleFormRow) and the CRM Developer checks use the LAST "CRM Developer" tab. Same pattern as CRM-542_1.2.1.1.
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current TC ID
 *    - Email textbox = Company email (with template Test@company + current date + current time.com)
 *      (Remember the created email, called Email_Lead#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Brussels Capital
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1, called URL_Lead#1
 * 
 * II. Condition#2 to create Lead#2:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current TC ID
 *    - Email textbox = Email_Lead#1 that created in Condition#1
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is TRUE
 *    - Tags = "Can_Merge"
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = BLANK
 * 4. Press "SAVE" button
 * 5. Press "EDIT" button and wait
 * 6. Click at "Deal registration" tab then do the following:
 *    - "Registered deal" checkbox = TRUE
 *    - "Deal registration start date" = Current Date
 *    - "Deal registration end date" = Current Date
 * 7. Press "SAVE" button again
 * 8. Copy URL of Lead#2, called URL_Lead#2
 * 
 * Steps to reproduce:
 * 1. Wait for 1 minute for Lead Merging happened
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains 2 values: "Can_Merge", "Trial download"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Brussels Capital
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Download Free Trial
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area, verify the following:
 *    5.1. There is the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 *    5.2. Click at "Deal registration" tab and verify the following:
 *         - "Registered deal" checkbox = TRUE
 *         - "Deal registration start date" = Current Date
 *         - "Deal registration end date" = Current Date
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field contains "Can_Merge"
 *    7.2. Company Name textbox = Company Name Lead 1 <-- which auto set due to created Contact
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list has a value or not
 *    7.7. Email textbox = Email_Lead#1 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = BLANK
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area, verify the following:
 *    9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-1992_1.1.1.1.1 - Lead Merging: Same Company Email with Deal Registration', () => {
  
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
      
      // Wait for any loading spinners to disappear
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');
      
      // Wait for all spinners to hide
      await page.waitForTimeout(3000);
      
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
        console.log('  ✓ Loading spinners have disappeared');
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      
      // Additional wait for page to fully stabilize
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('CRM-1992_1.1.1.1.1 [CRM-10787] [CRM-14070]: Verify merging leads with same company email (Created Manually = TRUE, Deal Registration)', async ({ page }, testInfo) => {
    test.skip(true, 'Step 5.2: Deal Registration of Lead#2 is not cloned to Lead#1 after the merge (Registered deal FALSE, dates BLANK) - blocked by CRM-14070');
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-1992_1.1.1.1.1';
    const vlog = new VerifyLog();
    let sharedEmail = '';
    let lead1Name = '';
    let lead1Id = '';
    let lead1Url = '';
    let lead2Name = '';
    let lead2Id = '';
    let lead2Url = '';

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

    // CONDITION #1: Create Lead #1 (Created Manually = FALSE, Download Free Trial, Deal Registration)
    await test.step('Condition #1: Create Lead #1 with Deal Registration (Created Manually = FALSE)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Created Manually = FALSE, Deal Registration) ===');;
      
      // Generate shared email that will be used for both leads
      sharedEmail = CommonUtils.generateEmail('Test', 'company');
      console.log(`Generated shared email: ${sharedEmail}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name with TC ID
      lead1Name = `TEST Lead 1 ${tcId}`;
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (Email_Lead#1)`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);
      
      // Fill Street
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - Belgium
      await leadPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);
      
      // Select State - Brussels Capital
      await leadPage.selectState('Brussels Capital');
      console.log(`  - State: Brussels Capital`);
      
      // Clear Sales Team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);

      // Fill Lead Form = Download Free Trial
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
      
      // Save Lead #1
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    // CONDITION #2: Create Lead #2 (Created Manually = TRUE, Deal Registration, Tag = Can_Merge)
    await test.step('Condition #2: Create Lead #2 with Deal Registration (Created Manually = TRUE, Tag = Can_Merge)', async () => {
      console.log('=== CONDITION #2: CREATING LEAD #2 (Created Manually = TRUE, Deal Registration, Tag = Can_Merge) ===');
      
      // Click CREATE button to create Lead #2
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name with TC ID
      lead2Name = `TEST Lead 2 ${tcId}`;
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Lead#1)`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 2');
      console.log(`  - Company Name: Company Name Lead 2`);
      
      // Fill Contact Name
      await leadPage.fillContactName('Contact Name Lead 2');
      console.log(`  - Contact Name: Contact Name Lead 2`);
      
      // Fill Street
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - United States
      await leadPage.selectCountry('United States');
      console.log(`  - Country: United States`);
      
      // Select State - Texas (US)
      await leadPage.selectState('Texas');
      console.log(`  - State: Texas (US)`);
      
      // Clear Sales Team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Check "Created Manually"
      await leadPage.checkCreatedManually();
      console.log(`  - Created Manually: TRUE`);
      
      // Add Tag "Can_Merge"
      await leadPage.addTag('Can_Merge');
      console.log(`  - Tag: Can_Merge`);
      
      // Fill Lead Form = BLANK (empty string)
      await leadPage.fillLeadForm('');
      console.log(`  - Lead Form: BLANK`);
      
      // Save Lead #2 (first save)
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      console.log(`✓ Lead #2 saved (first save) with ID: ${lead2Id}`);
      
      // Click EDIT button to enter edit mode
      console.log('\nClicking EDIT button...');
      await leadPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  ✓ EDIT mode activated');
      
      // Now configure Deal Registration
      console.log('\nConfiguring Deal Registration...');
      
      // Click on "Deal registration" tab
      await leadPage.clickDealRegistrationTab();
      console.log('  ✓ Clicked Deal Registration tab');
      
      // Check "Registered deal" checkbox
      await leadPage.checkRegisteredDeal();
      console.log('  - Registered deal: TRUE');
      
      // Get current date in YYYY-MM-DD format
      const currentDate = CommonUtils.formatDate();
      console.log(`  - Using current date: ${currentDate}`);
      
      // Set Deal registration start date
      await leadPage.fillDealRegistrationStartDate(currentDate);
      console.log(`  - Deal registration start date: ${currentDate}`);
      
      // Set Deal registration end date
      await leadPage.fillDealRegistrationEndDate(currentDate);
      console.log(`  - Deal registration end date: ${currentDate}`);
      
      // Save Lead #2 (second save with Deal Registration)
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved with Deal Registration`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created with Deal Registration (ID: ${lead2Id})`);
    });

    // STEP 1: Wait for Lead Merging to happen
    await test.step('Step 1: Wait for 1 minute for Lead Merging happened', async () => {
      console.log('\n=== STEP 1: WAIT FOR LEAD MERGING ===');
      console.log('⏳ Waiting 60 seconds for lead merging to occur...');
      
      await page.waitForTimeout(60000);
      
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

    // STEP 3: Verify Lead #1 fields (read where the form shows them - one evidence shot for the step)
    await verifyChecks(page, testInfo, vlog, 'Step 3: Verify the following fields on Lead #1', [
      { label: 'Step 3.1: Tag field contains "Can_Merge", "Trial download"', match: 'contains', expected: ['Can_Merge', 'Trial download'], highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: 'Step 3.2: Company Name textbox = Company Name Lead 1', match: 'contains', expected: 'Company Name Lead 1', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: 'Step 3.3: Street dropdown list = 123street', match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 3.4: Country dropdown list = Belgium', match: 'contains', expected: 'Belgium', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 3.5: State dropdown list = Brussels Capital', match: 'contains', expected: 'Brussels Capital', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 3.6: Sales Team dropdown list has a value or not', match: 'observe', expected: '', read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: 'Step 3.7: Email textbox = Email_Lead#1', match: 'contains', expected: sharedEmail, highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
    ]);

    // STEP 4: Verify Lead #1 CRM Developer tab (the LAST "CRM Developer" tab - the first one shows Lead Form only)
    await verifyChecks(page, testInfo, vlog, 'Step 4: Click at "CRM Developer" tab and verify the following', [
      { label: 'Step 4.1: Lead form textbox = Download Free Trial', match: 'equals', expected: 'Download Free Trial', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: 'Step 4.2: Active checkbox = TRUE', match: 'equals', expected: 'TRUE', highlight: HIGHLIGHT.active, read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: 'Step 4.3: Is Won = Pending', match: 'equals', expected: 'Pending', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: 'Step 4.4: Lost Reason = BLANK', match: 'equals', expected: '', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    // STEP 5: Verify Log area + Deal registration tab on Lead #1 (5.2's first read opens the Deal registration tab)
    const currentDate = CommonUtils.formatDate();
    await verifyChecks(page, testInfo, vlog, 'Step 5: On the Log area, verify the following', [
      { label: 'Step 5.1: Verify merge message in Log area', match: 'found', expected: `${lead2Name}, has been merged into this lead.`, meaning: 'NOT FOUND means Lead #2 was not merged into Lead #1', highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasSourceLeadMergeMessage(lead2Name)) ? 'FOUND' : 'NOT FOUND' }) },
      { label: 'Step 5.2: "Registered deal" checkbox = TRUE', match: 'equals', expected: 'TRUE', meaning: 'FALSE means the Deal registration was not cloned from Lead #2', highlight: HIGHLIGHT.registeredDeal,
        read: async () => {
          await leadPage.clickDealRegistrationTab();
          await page.waitForTimeout(CommonUtils.waitTimes.standard);
          return { actual: (await leadPage.isRegisteredDealChecked()) ? 'TRUE' : 'FALSE' };
        } },
      { label: 'Step 5.2: "Deal registration start date" = Current Date', match: 'equals', expected: currentDate, highlight: HIGHLIGHT.dealStart, read: async () => ({ actual: (await leadPage.getDealRegistrationStartDate()) ?? '' }) },
      { label: 'Step 5.2: "Deal registration end date" = Current Date', match: 'equals', expected: currentDate, highlight: HIGHLIGHT.dealEnd, read: async () => ({ actual: (await leadPage.getDealRegistrationEndDate()) ?? '' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    // STEP 6: Open Lead #2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Lead #2 opened successfully\n');
    });

    // STEP 7: Verify Lead #2 fields (read where the form shows them - one evidence shot for the step)
    await verifyChecks(page, testInfo, vlog, 'Step 7: Verify the following fields on Lead #2', [
      { label: 'Step 7.1: Tag field contains "Can_Merge"', match: 'contains', expected: 'Can_Merge', highlight: HIGHLIGHT.tags, read: async () => ({ actual: await leadPage.getTagsText() }) },
      { label: 'Step 7.2: Company Name textbox = Company Name Lead 1', match: 'contains', expected: 'Company Name Lead 1', meaning: 'auto set due to created Contact', highlight: HIGHLIGHT.companyName, read: () => readRow(leadPage, 'Company Name', 'company-name') },
      { label: 'Step 7.3: Street dropdown list = 123street', match: 'contains', expected: '123street', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 7.4: Country dropdown list = United States', match: 'contains', expected: 'United States', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 7.5: State dropdown list = Texas (US)', match: 'contains', expected: 'Texas', highlight: HIGHLIGHT.address, read: () => readRow(leadPage, 'Address', 'address') },
      { label: 'Step 7.6: Sales Team dropdown list has a value or not', match: 'observe', expected: '', read: async () => ({ actual: await leadPage.getSalesTeamValue() }) },
      { label: 'Step 7.7: Email textbox = Email_Lead#1', match: 'contains', expected: sharedEmail, highlight: HIGHLIGHT.email, read: async () => ({ actual: await leadPage.getEmailReadonly() }) },
    ]);

    // STEP 8: Verify Lead #2 CRM Developer tab (the LAST "CRM Developer" tab - the first one shows Lead Form only)
    await verifyChecks(page, testInfo, vlog, 'Step 8: Click at "CRM Developer" tab and verify the following', [
      { label: 'Step 8.1: Lead form textbox = BLANK', match: 'equals', expected: '', highlight: HIGHLIGHT.leadForm, read: () => readRow(leadPage, 'Lead Form', 'lead-form', null) },
      { label: 'Step 8.2: Active checkbox = FALSE', match: 'equals', expected: 'FALSE', meaning: 'TRUE would mean the record was not archived by a merge', highlight: HIGHLIGHT.active, read: () => readCheckbox(leadPage, 'Active', 'active') },
      { label: 'Step 8.3: Is Won = Lost', match: 'equals', expected: 'Lost', highlight: HIGHLIGHT.isWon, read: () => readRow(leadPage, 'Is Won', 'is-won', null) },
      { label: 'Step 8.4: Lost Reason = Duplicate', match: 'equals', expected: 'Duplicate', highlight: HIGHLIGHT.lostReason, read: () => readRow(leadPage, 'Lost Reason', 'lost-reason', null) },
    ], () => leadPage.clickCRMDeveloperTab_targetLead());

    // STEP 9: Verify Log area on Lead #2
    await verifyChecks(page, testInfo, vlog, 'Step 9: On the Log area, verify the following', [
      { label: 'Step 9.1: Verify merge message in Log area', match: 'found', expected: `This lead has been merged into ${lead1Name}.`, highlight: HIGHLIGHT.log,
        read: async () => ({ actual: (await leadPage.hasTargetLeadMergeMessage(lead1Name)) ? 'FOUND' : 'NOT FOUND' }) },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, CommonUtils.waitTimes.abnormalWait));

    // Verification - the VERIFY block of every verification point (replaces the hard-coded "All verification points passed" summary)
    await test.step('Verification', async () => {
      console.log('\n--- Verification ---');
      vlog.print(`Lead #2 (${lead2Id}) merged into Lead #1 (${lead1Id}) - fields, Deal registration and both log notes as expected`);
    });
  });
});

// ------------------------------------------------------------------------------------------------
// VERIFY block + verify-point evidence - kept in this spec (self-contained); same pattern as CRM-542_1.2.1.1
// ------------------------------------------------------------------------------------------------

/**
 * What each check read, outlined on its verify-evidence shot: field widgets by name, or the label + value cells
 * LeadPage.readVisibleFormRow() tagged (fields whose form carries hidden copies).
 */
const HIGHLIGHT = {
  tags: '.o_form_view [name="tag_ids"]',
  companyName: LeadPage.verifyRow('company-name'),
  address: LeadPage.verifyRow('address'),
  email: '.o_form_view [name="email_from"]',
  leadForm: LeadPage.verifyRow('lead-form'),
  active: LeadPage.verifyRow('active'),
  isWon: LeadPage.verifyRow('is-won'),
  lostReason: LeadPage.verifyRow('lost-reason'),
  log: '.o_mail_thread',
  registeredDeal: '.o_form_view [name="registered_deal"]',
  dealStart: '.o_form_view [name="deal_registration_start_date"]',
  dealEnd: '.o_form_view [name="deal_registration_end_date"]',
} as const;

interface VerifyRow {
  what: string;
  expected: string;
  actual: string;
  /** OBSERVED = read and shown, not scored (the manual step says "has a value or not") */
  result: 'PASS' | 'FAIL' | 'OBSERVED';
  /** FAIL only - what differs between Expected and Actual, computed from the asserted values */
  difference: string;
}

/** Every verification point of the run, printed as the VERIFY block in the Verification step. */
class VerifyLog {
  private rows: VerifyRow[] = [];
  add(row: VerifyRow): void {
    this.rows.push(row);
  }
  print(outcome: string): void {
    console.log('\n==================== VERIFY ====================');
    const failures: string[] = [];
    let n = 0;
    for (const r of this.rows) {
      if (r.result === 'OBSERVED') {
        console.log(`  Observation (not scored) - ${r.what} : ${r.actual}`);
        continue;
      }
      n++;
      console.log(`  Verify #${n} - ${r.what}:`);
      console.log(`     Expected : ${r.expected}`);
      console.log(`     Actual   : ${r.actual}`);
      console.log(`     Result   : ${r.result}`);
      if (r.result === 'FAIL') {
        console.log(`     Difference : ${r.difference}`);
        failures.push(`Verify #${n}: ${r.difference}`);
      }
    }
    console.log('================================================');
    console.log(failures.length === 0 ? `OVERALL: PASS - ${outcome}` : `OVERALL: FAIL - ${failures.join(' | ')}`);
  }
}

interface Check {
  /** the test.step label of this verification point */
  label: string;
  /** contains = every expected substring present; equals = exact value; found = the read returned FOUND; observe = shown, not scored */
  match: 'contains' | 'equals' | 'found' | 'observe';
  expected: string | string[];
  /** reads the value; `where` = where a labelled row was read (main sheet / "Follow-up" tab / not visible) */
  read: () => Promise<{ actual: string; where?: string }>;
  /** CSS selector of what the check read - outlined on the step's evidence shot in the colour of its own checks */
  highlight?: string;
  /** what a FAIL would mean, printed on the Expected line */
  meaning?: string;
}

/**
 * A labelled field, only where a user can see it on Lead #1 / Lead #2: the form as shown, else the `fallbackTab`
 * (null = only the tab the step opened - the CRM Developer fields).
 */
async function readRow(leadPage: LeadPage, label: string, key: string, fallbackTab: string | null = 'Follow-up'): Promise<{ actual: string; where: string }> {
  const row = await leadPage.readVisibleFormRow(label, key, fallbackTab);
  return { actual: row.value, where: row.where };
}

/** A shown checkbox field as TRUE / FALSE ('' when no shown row carries it) - in the tab the step opened. */
async function readCheckbox(leadPage: LeadPage, label: string, key: string): Promise<{ actual: string; where: string }> {
  const row = await leadPage.readVisibleFormRow(label, key, null);
  return { actual: row.checked === null ? '' : row.checked ? 'TRUE' : 'FALSE', where: row.where };
}

/**
 * One verification step: optional `before` (open a tab), one nested test.step per verification point - read, compute
 * the verdict, log Expected / Actual / Result (+ Difference on a FAIL), then expect.soft - and one evidence shot of
 * the step's screen in which every read element is outlined in the colour of its own checks.
 */
async function verifyChecks(page: Page, testInfo: TestInfo, vlog: VerifyLog, stepLabel: string, checks: Check[], before?: () => Promise<unknown>): Promise<void> {
  await test.step(stepLabel, async () => {
    console.log(`\n--- ${stepLabel} ---`);
    if (before) await before();
    const lines: string[] = [];
    const outlines = new Map<string, boolean>();
    let allPassed = true;

    for (const c of checks) {
      await test.step(c.label, async () => {
        console.log(`--- ${c.label} ---`);
        const exp = Array.isArray(c.expected) ? c.expected : [c.expected];
        const { actual: raw, where } = await c.read();
        const actual = (raw ?? '').replace(/\s+/g, ' ').trim();
        if (c.match === 'observe') {
          const shown = `${actual || '(empty)'}${where ? `  [read on: ${where}]` : ''}`;
          vlog.add({ what: c.label, expected: '', actual: shown, result: 'OBSERVED', difference: '' });
          console.log(`  Observation (not scored): ${shown}`);
          lines.push(`OBSERVED ${c.label}: ${shown}`);
          return;
        }
        const show = (v: string) => (v === '' ? 'BLANK' : `"${v}"`);
        let passed: boolean;
        let expectedText: string;
        let difference: string;
        if (c.match === 'contains') {
          const missing = exp.filter((v) => !actual.includes(v));
          passed = missing.length === 0;
          expectedText = `contains ${exp.map((v) => `"${v}"`).join(' + ')}`;
          difference = `${missing.map((v) => `'${v}'`).join(', ')} not found in '${actual || '(empty)'}'${where ? ` (${where})` : ''}`;
        } else if (c.match === 'found') {
          passed = actual === 'FOUND';
          expectedText = `"${exp[0]}" PRESENT`;
          difference = `'${exp[0]}' not found`;
        } else {
          passed = actual === exp[0];
          expectedText = show(exp[0]);
          difference = `expected ${show(exp[0])}, got ${show(actual)}${where ? ` (${where})` : ''}`;
        }
        if (c.meaning) expectedText = `${expectedText} (${c.meaning})`;
        const shownActual = `${c.match === 'equals' ? show(actual) : actual || '(empty)'}${where ? `  [read on: ${where}]` : ''}`;

        vlog.add({ what: c.label, expected: expectedText, actual: shownActual, result: passed ? 'PASS' : 'FAIL', difference });
        console.log(`  Expected : ${expectedText}`);
        console.log(`  Actual   : ${shownActual}`);
        console.log(`  Result   : ${passed ? 'PASS' : 'FAIL'}`);
        if (!passed) console.log(`  Difference : ${difference}`);
        lines.push(`${passed ? 'PASS' : 'FAIL'} ${c.label}`);
        lines.push(`  expected: ${expectedText}`);
        lines.push(`  actual  : ${shownActual}`);
        if (!passed) lines.push(`  difference: ${difference}`);
        if (!passed) allPassed = false;
        if (c.highlight) outlines.set(c.highlight, (outlines.get(c.highlight) ?? true) && passed);

        if (c.match === 'contains') for (const v of exp) expect.soft(actual, `${c.label} - contains "${v}"`).toContain(v);
        else if (c.match === 'found') expect.soft(actual, c.label).toBe('FOUND');
        else expect.soft(actual, c.label).toBe(exp[0]);
      });
    }

    await CommonUtils.captureVerifyEvidence(page, testInfo, {
      name: stepLabel.split(' (')[0],
      passed: allPassed,
      outlines: [...outlines].map(([selector, ok]) => ({ selector, passed: ok })),
      lines,
      corner: 'bottom-right',
    }).catch(() => {});
  });
}
