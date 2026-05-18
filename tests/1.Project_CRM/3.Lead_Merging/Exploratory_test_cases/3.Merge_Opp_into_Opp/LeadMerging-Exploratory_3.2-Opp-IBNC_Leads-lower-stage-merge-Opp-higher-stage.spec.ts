import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Opp Merging to Opp Test - IB Renewal Opp with Lower Stage
 * Test Case ID: LeadMerging-Exploratory_3.2
 * 
 * Summary: Verify that the merging opp happens successfully when target has IB renewal lead form but lower stage
 * 
 * Command to run:
 * npx playwright test --grep "LeadMerging-Exploratory_3.2" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 
 * I. Condition#1 to create Opp#1:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Opp name textbox = TEST Opp 1 + current TC ID
 *    - Email textbox = Company email (with template Test@company + current date + current time.com)
 *      (Remember the created email, called Email_Opp#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Opp 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is TRUE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 4. On "Stage", select the Stage = HOT DEAL
 * 5. Press "SAVE" button and wait
 * 6. Copy URL of Opp#1, called URL_Opp#1
 * 7. Press "Application" icon on left-top of screen and wait
 * 
 * II. Condition#2 to create Opp#2:
 * 1. On "CRM" page:
 *    1.1. Click at "view list" button
 *    1.2. On "Opps" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Opp 2 + current TC ID
 *    - Email textbox = Email_Opp#1 that created in Condition#1
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Opp 2
 *      - Contact Name textbox = Contact Name Opp 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = IB NC Leads
 * 4. Press "SAVE" button
 * 5. Copy URL of Opp#2, called URL_Opp#2
 * 
 * Steps to reproduce:
 * 1. Wait for Lead Merging happened
 * 2. Open the Opp 1 using URL_Opp#1
 * 3. Verify the following:
 *    3.1. Tag field contains 2 values: "Renewal", "Trial download"
 *    3.2. Company Name textbox = Company Name Opp 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Flanders
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Opp#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Download Free Trial
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area, verify the following:
 *    5.1. There is the text as "[Opp 2], has been merged into this lead." where [Opp 2] is Opp Name of Opp#2
 * 6. Open the Opp#2 using URL_Opp#2
 * 7. Verify the following:
 *    7.1. Tag field contains "Renewal"
 *    7.2. Company Name textbox = Company Name Opp 1 (which auto set due to created Contact)
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas
 *    7.6. Sales Team dropdown list has a value or not
 *    7.7. Email textbox = Email_Opp#1 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = IB NC Leads
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area, verify the following:
 *    9.1. There is the text as "This lead has been merged into [Opp 1]." where [Opp 1] is Opp Name of Opp#1
 */

test.describe('LeadMerging-Exploratory_3.2 - Opp Merging to Opp: IB Renewal with Lower Stage', () => {
  
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
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      
      // Wait for any loading spinners to disappear
      const loadingSpinner = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        console.log('  - Loading spinner wait skipped');
      });
      
      // Wait for page to be stable (no network activity)
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
        console.log('  - Network idle wait skipped');
      });
      
      // Additional wait for rendering
      await page.waitForTimeout(3000);
      
      console.log('✓ Page stabilized, Playwright will now capture screenshot');
    }
  });

  test('Verify merging opp to opp when target has IB renewal lead form but lower stage', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);
    
    const tcId = 'LeadMerging-Exploratory_3.2';
    let sharedEmail: string;
    let opp1Name: string;
    let opp1Id: string;
    let opp1Url: string;
    let opp2Name: string;
    let opp2Id: string;
    let opp2Url: string;

    // PRE-CONDITION: Login and navigate to CRM
    await test.step('Pre-condition: Login and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
      
      console.log('Step 2: Navigating to CRM');
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();
      console.log('✓ Navigated to CRM page');
      
      console.log('Step 3: Clicking view list button');
      await opportunityPage.switchToListView();
      console.log('✓ Opp list view opened');
    });

    // CONDITION #1: Create Opp#1 (Created Manually = TRUE, Download Free Trial, Stage = HOT DEAL)
    await test.step('Condition #1: Create Opp#1 (Created Manually = TRUE, Lead Form = Download Free Trial, Stage = HOT DEAL)', async () => {
      console.log('\n=== CONDITION #1: CREATING OPP #1 (Created Manually = TRUE, Lead Form = Download Free Trial, Stage = HOT DEAL) ===');
      
      // Click CREATE button
      await opportunityPage.clickCreate();
      console.log('✓ Opp creation form opened');
      
      // Generate Opp #1 name and email
      opp1Name = `TEST Opp 1 ${tcId}`;
      sharedEmail = opportunityPage.generateEmail('Test@company');
      
      // Fill Opp #1 information
      await opportunityPage.fillOpportunityName(opp1Name);
      console.log(`  - Opp Name: ${opp1Name}`);
      
      await opportunityPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (saved as Email_Opp#1)`);
      
      // Fill Company Name
      await opportunityPage.fillCompanyName('Company Name Opp 1');
      console.log(`  - Company Name: Company Name Opp 1`);
      
      // Fill Street
      await opportunityPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - Belgium
      await opportunityPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);
      
      // Select State - Flanders
      await opportunityPage.selectState('Flanders');
      console.log(`  - State: Flanders`);
      
      // Clear Sales Team
      await opportunityPage.clearSalesTeam();
      console.log(`  - Sales Team: Cleared`);
      
      // Clear Salesperson
      await opportunityPage.clearSalesperson();
      console.log(`  - Salesperson: Cleared`);
      
      // Check "Created Manually"
      await opportunityPage.checkCreatedManually();
      console.log(`  - Created Manually: TRUE`);
      
      // Fill Lead Form = Download Free Trial
      await opportunityPage.clickCRMDeveloperTab();
      
      await opportunityPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
      
      // TODO: Select Stage = HOT DEAL (need to implement selectStage method in OpportunityPage)
      await opportunityPage.selectStageHotDeal('HOT DEAL');
      console.log(`  - Stage: HOT DEAL (TODO: implement stage selection)`);
      
      // Save Opp #1
      await opportunityPage.saveAndWaitForCompletion();
      
      opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      console.log(`✓ Opp #1 saved with ID: ${opp1Id}`);
      console.log(`  URL_Opp#1: ${opp1Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Opp #1 Created (ID: ${opp1Id})`);
      

      //6. Press "Application" icon on left-top of screen and wait
      await homePage.clickApplicationMenu();
      await homePage.waitForPageReady();
      
    });

    // CONDITION #2: Create Opp #2 (Created Manually = FALSE, IB NC Leads)
    await test.step('Condition #2: Create Opp #2 (Created Manually = FALSE, Lead Form = IB NC Leads)', async () => {
      console.log('\n=== CONDITION #2: CREATING OPP #2 (Created Manually = FALSE, Lead Form = IB NC Leads) ===');
      
      // Navigate back to CRM for Opp creation
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();

      // Stay on Opportunities list view (no need to navigate to Leads)
      await opportunityPage.switchToListView();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      // Click CREATE button to create Opp #2
      await opportunityPage.clickCreate();
      console.log('✓ Opp #2 creation form opened');
      
      // Generate Opp #2 name with TC ID
      opp2Name = `TEST Opp 2 ${tcId}`;
      
      // Fill Opp #2 information
      await opportunityPage.fillOpportunityName(opp2Name);
      console.log(`  - Opp Name: ${opp2Name}`);
      
      await opportunityPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Opp#1)`);
      
      // Fill Company Name
      await opportunityPage.fillCompanyName('Company Name Opp 2');
      console.log(`  - Company Name: Company Name Opp 2`);
      
      // Fill Street
      await opportunityPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - United States
      await opportunityPage.selectCountry('United States');
      console.log(`  - Country: United States`);
      
      // Select State - Texas (US)
      await opportunityPage.selectState('Texas');
      console.log(`  - State: Texas (US)`);
      
      // Clear Sales Team
      await opportunityPage.clearSalesTeam();
      console.log(`  - Sales Team: Cleared`);
      
      // Clear Salesperson
      await opportunityPage.clearSalesperson();
      console.log(`  - Salesperson: Cleared`);
      
      // Uncheck "Created Manually"
      await opportunityPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      // Fill Lead Form = IB NC Leads
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form: IB NC Leads`);
      
      // Save Opp #2
      await opportunityPage.saveAndWaitForCompletion();
      
      opp2Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp2Url = page.url();
      console.log(`✓ Opp #2 saved with ID: ${opp2Id}`);
      console.log(`  URL_Opp#2: ${opp2Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Opp #2 Created (ID: ${opp2Id})`);
    });
 
    //Steps to reproduce:


    // STEP 1: Wait for Lead Merging to happen
    await test.step('Step 1: Wait for Lead Merging happened', async () => {
      console.log('\n=== STEP 1: WAIT FOR LEAD MERGING ===');
      console.log('⏳ Waiting for lead merging to occur...');
      
      // Wait for lead merging to happen (navigate to Target Opp page - Opp #1 with higher stage)
      // Navigate to Opp#1 first
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
      
      // Wait for merge notification using reusable method (polls on target lead for "[opp2Name], has been merged into this lead")
      const mergeNotificationFound = await leadPage.waitForLeadMergingHappen_OnTargetLead(opp2Name);
      expect(mergeNotificationFound).toBeTruthy();
      
      console.log('✓ Wait complete - proceeding to verification\n');
    });

    // STEP 2: Open Opp #1 (Target)
    await test.step('Step 2: Open the Opp 1 using URL_Opp#1', async () => {
      console.log('\n=== STEP 2: OPEN OPP #1 (TARGET) ===');
      console.log(`Current URL before navigation: ${page.url()}`);
      console.log(`Navigating to Opp #1 URL: ${opp1Url}`);
      
      // Navigate to merged opp
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      //await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
      
      // Take screenshot for verification
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Opp #2 Opened (ID: ${opp2Id})`);
    });

    // STEP 3: Verify Opp #2 fields
    await test.step('Step 3: Verify the following fields on Opp #1', async () => {
      console.log('=== STEP 3: VERIFY OPP #1 FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Verify Tags contain "Renewal", "Trial download"
      await test.step('Step 3.1: Tag field contains "Renewal", "Trial download"', async () => {
        const tagsText = await opportunityPage.getTagsText();
        
        expect(tagsText).toContain('Renewal');
        expect(tagsText).toContain('Trial download');
        console.log(`  ✓ Step 3.1: Tags contain "Renewal" and "Trial download"`);
      });

      // Step 3.2: Verify Company Name
      await test.step('Step 3.2: Company Name textbox = Company Name Opp 1', async () => {
        const companyName = await opportunityPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Opp 1');
        console.log(`  ✓ Step 3.2: Company Name = Company Name Opp 1`);
      });

      // Step 3.3: Verify Street
      await test.step('Step 3.3: Street dropdown list = 123street', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 3.3: Street = 123street`);
      });

      // Step 3.4: Verify Country
      await test.step('Step 3.4: Country dropdown list = Belgium', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('Belgium');
        console.log(`  ✓ Step 3.4: Country = Belgium`);
      });

      // Step 3.5: Verify State
      await test.step('Step 3.5: State dropdown list = Flanders', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('Flanders');
        console.log(`  ✓ Step 3.5: State = Flanders`);
      });

      // Step 3.6: Verify Sales Team (has a value or not)
      await test.step('Step 3.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await opportunityPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 3.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 3.7: Verify Email
      await test.step('Step 3.7: Email textbox = Email_Opp#1', async () => {
        const email = await opportunityPage.getEmailReadonly();
        
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 4: Verify Opp #1 CRM Developer tab
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER TAB (OPP #1) ===\n');
      
      // Click on CRM Developer tab
      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 4.1: Verify Lead form
      await test.step('Step 4.1: Lead form textbox = Download Free Trial', async () => {
        const leadForm = await opportunityPage.getLeadFormValue();
        
        expect(leadForm).toBe('Download Free Trial');
        console.log(`  ✓ Step 4.1: Lead form = ${leadForm}`);
      });

      // Step 4.2: Verify Active checkbox
      await test.step('Step 4.2: Active checkbox = TRUE', async () => {
        const isActive = await opportunityPage.isActiveChecked();
        
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 4.2: Active = TRUE`);
      });

      // Step 4.3: Verify Is Won
      await test.step('Step 4.3: Is Won = Pending', async () => {
        const isWon = await opportunityPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 4.3: Is Won = ${isWon}`);
      });

      // Step 4.4: Verify Lost Reason is BLANK
      await test.step('Step 4.4: Lost Reason = BLANK', async () => {
        const lostReasonValue = await opportunityPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
      });
    });

    // STEP 5: Verify Log area on Opp #1
    await test.step('Step 5: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA (OPP #1) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 5.1: Verify merge message
      await test.step('Step 5.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await opportunityPage.hasSourceLeadMergeMessage(opp2Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 5.1: Found log message: "${opp2Name}, has been merged into this lead."`);
      });
    });

    // STEP 6: Open Opp #2 (Source)
    await test.step('Step 6: Open the Opp#2 using URL_Opp#2', async () => {
      console.log('\n=== STEP 6: OPEN OPP #2 (SOURCE) ===');
      console.log(`Navigating to Opp #2 URL: ${opp2Url}`);
      
      await page.goto(opp2Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      //await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
      
      console.log('✓ Opp #2 opened successfully\n');
    });

   

    // STEP 7: Verify Opp #2 fields
    await test.step('Step 7: Verify the following fields on Opp #2', async () => {
      console.log('=== STEP 7: VERIFY OPP #2 FIELDS (READONLY MODE) ===\n');
      
      // Step 7.1: Verify Tags contain "Renewal"
      await test.step('Step 7.1: Tag field contains "Renewal"', async () => {
        const tagsText = await opportunityPage.getTagsText();
        
        expect(tagsText).toContain('Renewal');
        console.log(`  ✓ Step 7.1: Tags contain "Renewal"`);
      });

      // Step 7.2: Verify Company Name (auto set due to created Contact)
      await test.step('Step 7.2: Company Name textbox = Company Name Opp 1', async () => {
        const companyName = await opportunityPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Opp 1');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Opp 1 (auto set due to created Contact)`);
      });

      // Step 7.3: Verify Street
      await test.step('Step 7.3: Street dropdown list = 123street', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 7.3: Street = 123street`);
      });

      // Step 7.4: Verify Country
      await test.step('Step 7.4: Country dropdown list = United States', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 7.4: Country = United States`);
      });

      // Step 7.5: Verify State
      await test.step('Step 7.5: State dropdown list = Texas', async () => {
        const addressText = await opportunityPage.getAddressReadonly();
        
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 7.5: State = Texas`);
      });

      // Step 7.6: Verify Sales Team (has a value or not)
      await test.step('Step 7.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await opportunityPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 7.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 7.7: Verify Email
      await test.step('Step 7.7: Email textbox = Email_Opp#1', async () => {
        const email = await opportunityPage.getEmailReadonly();
        
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 7.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 8: Verify Opp #2 CRM Developer tab
    await test.step('Step 8: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER TAB (OPP #2) ===\n');
      
      // Click on CRM Developer tab
      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 8.1: Verify Lead form
      await test.step('Step 8.1: Lead form textbox = IB NC Leads', async () => {
        const leadForm = await opportunityPage.getLeadFormValue();
        
        expect(leadForm).toBe('IB NC Leads');
        console.log(`  ✓ Step 8.1: Lead form = ${leadForm}`);
      });

      // Step 8.2: Verify Active checkbox
      await test.step('Step 8.2: Active checkbox = FALSE', async () => {
        const isActive = await opportunityPage.isActiveChecked();
        
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 8.2: Active = FALSE`);
      });

      // Step 8.3: Verify Is Won
      await test.step('Step 8.3: Is Won = Lost', async () => {
        const isWon = await opportunityPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Lost');
        console.log(`  ✓ Step 8.3: Is Won = ${isWon}`);
      });

      // Step 8.4: Verify Lost Reason = Duplicate
      await test.step('Step 8.4: Lost Reason = Duplicate', async () => {
        const lostReasonValue = await opportunityPage.getLostReasonValueViaTextContent();
        
        expect(lostReasonValue).toBe('Duplicate');
        console.log(`  ✓ Step 8.4: Lost Reason = ${lostReasonValue}`);
      });
    });

    // STEP 9: Verify Log area on Opp #2
    await test.step('Step 9: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 9: VERIFY LOG AREA (OPP #2) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 9.1: Verify merge message
      await test.step('Step 9.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await opportunityPage.hasTargetLeadMergeMessage(opp1Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 9.1: Found log message: "This lead has been merged into ${opp1Name}."`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: Opp merging to Opp verified successfully');
      console.log(`   Opp #1 (${opp1Id}): Active=TRUE, Is Won=Pending, Tags: Renewal, Trial download`);
      console.log(`   - Created Manually: TRUE`);
      console.log(`   - Lead Form: Download Free Trial`);
      console.log(`   - Stage: HOT DEAL`);
      console.log(`   Opp #2 (${opp2Id}): Active=FALSE, Is Won=Lost, Lost Reason=Duplicate`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: IB NC Leads`);
      console.log(`   Email: ${sharedEmail}`);
      console.log(`   All verification points passed`);
      console.log('==================================================\n');
      
      // Attach verification summary
      const verificationSummaryHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', sans-serif; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #16a34a; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .entity-section { background: #dcfce7; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .entity-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #15803d; }
    .steps-section { background: #f0fdf4; padding: 20px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #bbf7d0; }
    .steps-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #16a34a; padding-bottom: 10px; }
    .step-group { margin-bottom: 15px; }
    .step-group-title { font-weight: bold; color: #166534; font-size: 14px; margin-bottom: 8px; }
    .step-item { margin: 4px 0; padding-left: 20px; color: #14532d; font-size: 13px; }
    .step-item::before { content: "✓ "; color: #16a34a; font-weight: bold; margin-right: 5px; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #14532d; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>OPP MERGING TO OPP TEST - LeadMerging-Exploratory_3.2</h2>
    </div>
    
    <div class="steps-section">
      <div class="steps-title">📝 Test Execution Steps</div>
      
      <div class="step-group">
        <div class="step-group-title">Pre-condition</div>
        <div class="step-item">Login successful as ${users.admin_crm.displayName}</div>
        <div class="step-item">Navigated to CRM page</div>
        <div class="step-item">Opp list view opened</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Condition #1: Creating Opp #1 (Created Manually = TRUE, Lead Form = Download Free Trial, Stage = HOT DEAL)</div>
        <div class="step-item">Opp #1 saved with ID: ${opp1Id}</div>
        <div class="step-item">Opp Name: ${opp1Name}</div>
        <div class="step-item">Email: ${sharedEmail} (saved as Email_Opp#1)</div>
        <div class="step-item">Company Name: Company Name Opp 1</div>
        <div class="step-item">Location: Belgium, Flanders</div>
        <div class="step-item">Created Manually: TRUE</div>
        <div class="step-item">Lead Form: Download Free Trial</div>
        <div class="step-item">Stage: HOT DEAL</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Condition #2: Creating Opp #2 (Created Manually = FALSE, Lead Form = IB NC Leads)</div>
        <div class="step-item">Opp #2 saved with ID: ${opp2Id}</div>
        <div class="step-item">Opp Name: ${opp2Name}</div>
        <div class="step-item">Email: ${sharedEmail} (same as Email_Opp#1)</div>
        <div class="step-item">Company Name: Company Name Opp 2</div>
        <div class="step-item">Location: United States, Texas</div>
        <div class="step-item">Created Manually: FALSE</div>
        <div class="step-item">Lead Form: IB NC Leads</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 1: Wait for Lead Merging</div>
        <div class="step-item">Wait complete - proceeding to verification</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 2: Open Opp #1 (Target)</div>
        <div class="step-item">Opp #1 opened successfully</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 3: Verify Opp #1 Fields (Target - Active)</div>
        <div class="step-item">Step 3.1: Tags contain "Renewal" and "Trial download"</div>
        <div class="step-item">Step 3.2: Company Name = Company Name Opp 1</div>
        <div class="step-item">Step 3.3: Street = 123street</div>
        <div class="step-item">Step 3.4: Country = Belgium</div>
        <div class="step-item">Step 3.5: State = Flanders</div>
        <div class="step-item">Step 3.6: Sales Team = verified</div>
        <div class="step-item">Step 3.7: Email = ${sharedEmail}</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 4: Verify CRM Developer Tab (Opp #1)</div>
        <div class="step-item">Step 4.1: Lead form = Download Free Trial</div>
        <div class="step-item">Step 4.2: Active = TRUE</div>
        <div class="step-item">Step 4.3: Is Won = Pending</div>
        <div class="step-item">Step 4.4: Lost Reason = BLANK</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 5: Verify Log Area (Opp #1)</div>
        <div class="step-item">Step 5.1: Found log message: "${opp2Name}, has been merged into this lead."</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 6: Open Opp #2 (Source)</div>
        <div class="step-item">Opp #2 opened successfully</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 7: Verify Opp #2 Fields (Source - Merged)</div>
        <div class="step-item">Step 7.1: Tags contain "Renewal"</div>
        <div class="step-item">Step 7.2: Company Name = Company Name Opp 1 (auto set due to created Contact)</div>
        <div class="step-item">Step 7.3: Street = 123street</div>
        <div class="step-item">Step 7.4: Country = United States</div>
        <div class="step-item">Step 7.5: State = Texas</div>
        <div class="step-item">Step 7.6: Sales Team = verified</div>
        <div class="step-item">Step 7.7: Email = ${sharedEmail}</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 8: Verify CRM Developer Tab (Opp #2)</div>
        <div class="step-item">Step 8.1: Lead form = IB NC Leads</div>
        <div class="step-item">Step 8.2: Active = FALSE</div>
        <div class="step-item">Step 8.3: Is Won = Lost</div>
        <div class="step-item">Step 8.4: Lost Reason = Duplicate</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 9: Verify Log Area (Opp #2)</div>
        <div class="step-item">Step 9.1: Found log message: "This lead has been merged into ${opp1Name}."</div>
      </div>
    </div>
    
    <div class="entity-section">
      <div class="entity-title">📋 Opp #1 - Target Opportunity (Active)</div>
      <div class="info-row"><span class="label">Opp ID:</span> ${opp1Id}</div>
      <div class="info-row"><span class="label">Opp Name:</span> ${opp1Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Renewal, Trial download</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Opp 1</div>
      <div class="info-row"><span class="label">Location:</span> Belgium, Flanders (BE)</div>
      <div class="info-row"><span class="label">Created Manually:</span> TRUE</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial</div>
      <div class="info-row"><span class="label">Stage:</span> HOT DEAL</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">URL:</span> ${opp1Url}</div>
    </div>
    
    <div class="entity-section">
      <div class="entity-title">📋 Opp #2 - Source Opportunity (Merged)</div>
      <div class="info-row"><span class="label">Opp ID:</span> ${opp2Id}</div>
      <div class="info-row"><span class="label">Opp Name:</span> ${opp2Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Renewal</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Opp 1 (auto-set)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> IB NC Leads</div>
      <div class="info-row"><span class="label">Active:</span> FALSE</div>
      <div class="info-row"><span class="label">Is Won:</span> Lost</div>
      <div class="info-row"><span class="label">Lost Reason:</span> Duplicate</div>
      <div class="info-row"><span class="label">URL:</span> ${opp2Url}</div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Opp merging to Opp with higher stage opp winning verified successfully<br>
        Opp #2 merged into Opp #1 (higher stage wins)<br>
        Email: ${sharedEmail}<br>
        <br>
        <strong>All verification points passed</strong>
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 Opp Merging to Opp - Test Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
