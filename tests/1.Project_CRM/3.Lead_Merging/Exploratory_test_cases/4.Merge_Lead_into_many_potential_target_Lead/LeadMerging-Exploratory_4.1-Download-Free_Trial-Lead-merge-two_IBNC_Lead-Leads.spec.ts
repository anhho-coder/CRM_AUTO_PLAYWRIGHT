import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging to Opp Test - Two Leads Merging with Same Company Email
 * Test Case ID: LeadMerging-Exploratory_4.1
 * 
 * Summary: Verify that the merging lead happens successfully when there are 2 potential target leads 
 * and one of them is earlier lead
 * 
 * Command to run:
 * npx playwright test --grep "LeadMerging-Exploratory_4.1" --project=chromium
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
 *    - Created manually checkbox is FALSE  
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = IB NC Leads
 * 4. Press "SAVE" button and wait
 * 5. Copy URL of Opp#1, called URL_Opp#1
 * 6. Press "Application" icon on left-top of screen and wait
 * 
 * II. Condition#2 to create Lead#2:
 * 1. Click at "CRM" button and wait:
 *    1.1. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *    1.2. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current TC ID
 *    - Email textbox = Email_Opp#1 that created in Condition#1
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = IB NC Leads
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#2, called URL_Lead#2
 * 6. Press "Application" icon on left-top of screen and wait
 * 
 * III. Condition#3 to create Lead#3:
 * 1. Click at "CRM" button and wait:
 *    1.1. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 *    1.2. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 3 + current TC ID
 *    - Email textbox = Email_Opp#1 that created in Condition#1
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 3
 *      - Contact Name textbox = Contact Name Lead 3
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#3, called URL_Lead#3
 * 
 * Steps to reproduce:
 * 1. Wait for 1 minute for Lead Merging happened
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
 *    4.1. Lead form textbox = IB NC Leads
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area, verify the following:
 *    5.1. There is the text as "[LEAD 3], has been merged into this lead." where [LEAD 3] is Lead Name of Lead#3
 * 
 * 6. Open the Lead 2 using URL_Lead#2
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
 *    8.2. Active checkbox = TRUE
 *    8.3. Is Won = Pending
 *    8.4. Lost Reason = BLANK
 * 
 * 10. Open the Lead 3 using URL_Lead#3
 * 11. Verify the following:
 *    11.1. Tag field contains "Trial download"
 *    11.2. Company Name textbox = Company Name Opp 1 (which auto set due to created Contact)
 *    11.3. Street dropdown list = 123street
 *    11.4. Country dropdown list = United States
 *    11.5. State dropdown list = Texas
 *    11.6. Sales Team dropdown list has a value or not
 *    11.7. Email textbox = Email_Opp#1 that created previously
 * 12. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    12.1. Lead form textbox = Download Free Trial
 *    12.2. Active checkbox = FALSE
 *    12.3. Is Won = Lost
 *    12.4. Lost Reason = Duplicate
 * 13. On the Log area, verify the following:
 *    13.1. There is the text as "This lead has been merged into [Opp 1]." where [Opp 1] is Opp Name of Opp#1
 */

test.describe('LeadMerging-Exploratory_4.1 - Two Leads Merging to Opp: Earlier Lead Wins', () => {
  
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

  test('Verify merging lead when there are 2 potential target leads and one is earlier', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);
    
    const tcId = 'LeadMerging-Exploratory_4.1';
    let sharedEmail: string;
    let opp1Name: string;
    let opp1Id: string;
    let opp1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;
    let lead3Name: string;
    let lead3Id: string;
    let lead3Url: string;

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

    // CONDITION #1: Create Opp#1 (Created Manually = FALSE, IB NC Leads)
    await test.step('Condition #1: Create Opp#1 (Created Manually = FALSE, Lead Form = IB NC Leads)', async () => {
      console.log('\n=== CONDITION #1: CREATING OPP #1 (Created Manually = FALSE, Lead Form = IB NC Leads) ===');
      
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
      await opportunityPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      // Fill Lead Form = IB NC Leads
      await opportunityPage.clickCRMDeveloperTab();
      
      await opportunityPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form: IB NC Leads`);
      
      // Save Opp #1
      await opportunityPage.saveAndWaitForCompletion();
      
      opp1Id = await opportunityPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      opp1Url = page.url();
      console.log(`✓ Opp #1 saved with ID: ${opp1Id}`);
      console.log(`  URL_Opp#1: ${opp1Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Opp #1 Created (ID: ${opp1Id})`);
      
      // Press "Application" icon on left-top of screen and wait
      await homePage.clickApplicationMenu();
      await homePage.waitForPageReady();
    });

    // CONDITION #2: Create Lead #2 (Created Manually = FALSE, IB NC Leads)
    await test.step('Condition #2: Create Lead #2 (Created Manually = FALSE, Lead Form = IB NC Leads)', async () => {
      console.log('\n=== CONDITION #2: CREATING LEAD #2 (Created Manually = FALSE, Lead Form = IB NC Leads) ===');
      
      // Navigate back to CRM for Lead creation
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();

      // Navigate to Leads
      await homePage.navigateToLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      // Click CREATE button to create Lead #2
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name with TC ID
      lead2Name = `TEST Lead 2 ${tcId}`;
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Opp#1)`);
      
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
      
      // Uncheck "Created Manually"
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      // Fill Lead Form = IB NC Leads
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form: IB NC Leads`);
      
      // Save Lead #2
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);

      // Press "Application" icon on left-top of screen and wait
      await homePage.clickApplicationMenu();
      await homePage.waitForPageReady();
    });

    // CONDITION #3: Create Lead #3 (Created Manually = FALSE, Download Free Trial)
    await test.step('Condition #3: Create Lead #3 (Created Manually = FALSE, Lead Form = Download Free Trial)', async () => {
      console.log('\n=== CONDITION #3: CREATING LEAD #3 (Created Manually = FALSE, Lead Form = Download Free Trial) ===');
      
      // Navigate back to CRM for Lead creation
      await homePage.navigateToCRM();
      await homePage.waitForPageReady();

      // Navigate to Leads
      await homePage.navigateToLeads();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      // Click CREATE button to create Lead #3
      await leadPage.clickCreate();
      console.log('✓ Lead #3 creation form opened');
      
      // Generate Lead #3 name with TC ID
      lead3Name = `TEST Lead 3 ${tcId}`;
      
      // Fill Lead #3 information
      await leadPage.fillLeadOpportunity(lead3Name);
      console.log(`  - Lead Name: ${lead3Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Opp#1)`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 3');
      console.log(`  - Company Name: Company Name Lead 3`);
      
      // Fill Contact Name
      await leadPage.fillContactName('Contact Name Lead 3');
      console.log(`  - Contact Name: Contact Name Lead 3`);
      
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
      
      // Uncheck "Created Manually"
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      // Fill Lead Form = Download Free Trial
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
      
      // Save Lead #3
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead3Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead3Url = page.url();
      console.log(`✓ Lead #3 saved with ID: ${lead3Id}`);
      console.log(`  URL_Lead#3: ${lead3Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #3 - Lead #3 Created (ID: ${lead3Id})`);
    });
 
    //Steps to reproduce:


    // STEP 1: Wait for Lead Merging to happen
    await test.step('Step 1: Wait for 1 minute for Lead Merging happened', async () => {
      console.log('\n=== STEP 1: WAIT FOR LEAD MERGING ===');
      console.log('⏳ Waiting for lead merging to occur...');
      
      // Wait for lead merging to happen (stays at Source Lead page - Lead #3)
      const mergeNotificationFound = await leadPage.waitForLeadMergingHappen(opp1Name, 6, 30000);
      
      // Assert that merge notification was found
      expect(mergeNotificationFound).toBeTruthy();
      
      console.log('✓ Wait complete - proceeding to verification\n');
    });

    // STEP 2: Open Opp #1
    await test.step('Step 2: Open the Opp 1 using URL_Opp#1', async () => {
      console.log('=== STEP 2: OPEN OPP #1 ===');
      console.log(`Navigating to Opp #1 URL: ${opp1Url}`);
      
      await page.goto(opp1Url, { waitUntil: 'domcontentloaded' });
      await opportunityPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.pageLoad);
      
      console.log('✓ Opp #1 opened successfully\n');
    });

    // STEP 3: Verify Opp #1 fields
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
      await test.step('Step 3.2: Company Name textbox = Company Name Lead 1', async () => {
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
      await test.step('Step 4.1: Lead form textbox = IB NC Leads', async () => {
        const leadForm = await opportunityPage.getLeadFormValue();
        
        expect(leadForm).toBe('IB NC Leads');
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
        const hasMergeMessage = await opportunityPage.hasSourceLeadMergeMessage(lead3Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 5.1: Found log message: "${lead3Name}, has been merged into this lead."`);
      });
    });

    // STEP 6: Open Lead #2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Current URL before navigation: ${page.url()}`);
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      // Navigate to merged lead with action=682
      lead2Url = await leadPage.navigateToMergedLeadWithAction682(lead2Url, lead2Id, config.timeouts.loadingSpinner);
      
      // Take screenshot for verification
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 Opened (ID: ${lead2Id})`);
    });

   

    // STEP 7: Verify Lead #2 fields
    await test.step('Step 7: Verify the following fields on Lead #2', async () => {
      console.log('=== STEP 7: VERIFY LEAD #2 FIELDS (READONLY MODE) ===\n');
      
      // Step 7.1: Verify Tags contain "Renewal"
      await test.step('Step 7.1: Tag field contains "Renewal"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Renewal');
        console.log(`  ✓ Step 7.1: Tags contain "Renewal"`);
      });

      // Step 7.2: Verify Company Name (auto set due to created Contact)
      await test.step('Step 7.2: Company Name textbox = Company Name Opp 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Opp 1');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Opp 1 (auto set due to created Contact)`);
      });

      // Step 7.3: Verify Street
      await test.step('Step 7.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 7.3: Street = 123street`);
      });

      // Step 7.4: Verify Country
      await test.step('Step 7.4: Country dropdown list = United States', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 7.4: Country = United States`);
      });

      // Step 7.5: Verify State
      await test.step('Step 7.5: State dropdown list = Texas', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 7.5: State = Texas`);
      });

      // Step 7.6: Verify Sales Team (has a value or not)
      await test.step('Step 7.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 7.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 7.7: Verify Email
      await test.step('Step 7.7: Email textbox = Email_Opp#1', async () => {
        const email = await leadPage.getEmailReadonly();
        
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 7.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 8: Verify Lead #2 CRM Developer tab
    await test.step('Step 8: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER TAB (LEAD #2) ===\n');
      
      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 8.1: Verify Lead form
      await test.step('Step 8.1: Lead form textbox = IB NC Leads', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('IB NC Leads');
        console.log(`  ✓ Step 8.1: Lead form = ${leadForm}`);
      });

      // Step 8.2: Verify Active checkbox
      await test.step('Step 8.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 8.2: Active = TRUE`);
      });

      // Step 8.3: Verify Is Won
      await test.step('Step 8.3: Is Won = Pending', async () => {
        const isWon = await leadPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 8.3: Is Won = ${isWon}`);
      });

      // Step 8.4: Verify Lost Reason = BLANK
      await test.step('Step 8.4: Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 8.4: Lost Reason = BLANK`);
      });
    });

    // STEP 10: Open Lead #3
    await test.step('Step 10: Open the Lead 3 using URL_Lead#3', async () => {
      console.log('\n=== STEP 10: OPEN LEAD #3 ===');
      console.log(`Current URL before navigation: ${page.url()}`);
      console.log(`Navigating to Lead #3 URL: ${lead3Url}`);
      
      // Navigate to merged lead with action=682
      lead3Url = await leadPage.navigateToMergedLeadWithAction682(lead3Url, lead3Id, config.timeouts.loadingSpinner);
      
      // Take screenshot for verification
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 10 - Lead #3 Opened (ID: ${lead3Id})`);
    });

    // STEP 11: Verify Lead #3 fields
    await test.step('Step 11: Verify the following fields on Lead #3', async () => {
      console.log('=== STEP 11: VERIFY LEAD #3 FIELDS (READONLY MODE) ===\n');
      
    
      // Step 11.1: Verify Tags contain "Trial download"
      await test.step('Step 11.1: Tag field contains "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Trial download');
        console.log(`  ✓ Step 11.1: Tags contain "Trial download"`);
      });

      // Step 11.2: Verify Company Name (auto set due to created Contact)
      await test.step('Step 11.2: Company Name textbox = Company Name Opp 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Opp 1');
        console.log(`  ✓ Step 11.2: Company Name = Company Name Opp 1 (auto set due to created Contact)`);
      });

      // Step 11.3: Verify Street
      await test.step('Step 11.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 11.3: Street = 123street`);
      });

      // Step 11.4: Verify Country
      await test.step('Step 11.4: Country dropdown list = United States', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 11.4: Country = United States`);
      });

      // Step 11.5: Verify State
      await test.step('Step 11.5: State dropdown list = Texas', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 11.5: State = Texas`);
      });

      // Step 11.6: Verify Sales Team (has a value or not)
      await test.step('Step 11.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 11.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 11.7: Verify Email
      await test.step('Step 11.7: Email textbox = Email_Opp#1', async () => {
        const email = await leadPage.getEmailReadonly();
        
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 11.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 12: Verify Lead #3 CRM Developer tab
    await test.step('Step 12: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 12: VERIFY CRM DEVELOPER TAB (LEAD #3) ===\n');
      
      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 12.1: Verify Lead form
      await test.step('Step 12.1: Lead form textbox = Download Free Trial', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('Download Free Trial');
        console.log(`  ✓ Step 12.1: Lead form = ${leadForm}`);
      });

      // Step 12.2: Verify Active checkbox
      await test.step('Step 12.2: Active checkbox = FALSE', async () => {
        const isActive = await leadPage.isActiveChecked();
        
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 12.2: Active = FALSE`);
      });

      // Step 12.3: Verify Is Won
      await test.step('Step 12.3: Is Won = Lost', async () => {
        const isWon = await leadPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Lost');
        console.log(`  ✓ Step 12.3: Is Won = ${isWon}`);
      });

      // Step 12.4: Verify Lost Reason = Duplicate
      await test.step('Step 12.4: Lost Reason = Duplicate', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        
        expect(lostReasonValue).toBe('Duplicate');
        console.log(`  ✓ Step 12.4: Lost Reason = ${lostReasonValue}`);
      });
    });

    // STEP 13: Verify Log area on Lead #3
    await test.step('Step 13: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 13: VERIFY LOG AREA (LEAD #3) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 13.1: Verify merge message
      await test.step('Step 13.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(opp1Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 13.1: Found log message: "This lead has been merged into ${opp1Name}."`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: Two leads merging to Opp verified successfully');
      console.log(`   Opp #1 (${opp1Id}): Active=TRUE, Is Won=Pending, Tags: Renewal, Trial download`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: IB NC Leads`);
      console.log(`   - Created first (earlier lead)`);
      console.log(`   Lead #2 (${lead2Id}): Active=TRUE, Is Won=Pending`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: IB NC Leads`);
      console.log(`   - Stays active (IB renewal, created later)`);
      console.log(`   Lead #3 (${lead3Id}): Active=FALSE, Is Won=Lost, Lost Reason=Duplicate`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: Download Free Trial`);
      console.log(`   - Merged into Opp #1 (earlier IB renewal wins)`);
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
    .steps-section { background: #f0fdf4; padding: 20px; border-radius: 5px; margin-bottom: 15px; border: 1px solid #bbf7d0; }
    .steps-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #16a34a; padding-bottom: 10px; }
    .step-group { margin-bottom: 15px; }
    .step-group-title { font-weight: bold; color: #166534; font-size: 14px; margin-bottom: 8px; }
    .step-item { margin: 4px 0; padding-left: 20px; color: #14532d; font-size: 13px; }
    .step-item::before { content: "✓ "; color: #16a34a; font-weight: bold; margin-right: 5px; }
    .entity-section { background: #dcfce7; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .entity-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #15803d; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #14532d; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>TWO LEADS MERGING TO OPP TEST - LeadMerging-Exploratory_4.1</h2>
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
        <div class="step-group-title">Condition #1: Creating Opp #1 (Created Manually = FALSE, Lead Form = IB NC Leads)</div>
        <div class="step-item">Opp creation form opened</div>
        <div class="step-item">Opp #1 saved with ID: ${opp1Id}</div>
        <div class="step-item">Opp Name: ${opp1Name}</div>
        <div class="step-item">Email: ${sharedEmail} (saved as Email_Opp#1)</div>
        <div class="step-item">Company Name: Company Name Opp 1</div>
        <div class="step-item">Location: Belgium, Flanders</div>
        <div class="step-item">Sales Team: Cleared</div>
        <div class="step-item">Salesperson: Cleared</div>
        <div class="step-item">Created Manually: FALSE</div>
        <div class="step-item">Lead Form: IB NC Leads</div>
        <div class="step-item">Application icon pressed</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Condition #2: Creating Lead #2 (Created Manually = FALSE, Lead Form = IB NC Leads)</div>
        <div class="step-item">Lead #2 creation form opened</div>
        <div class="step-item">Lead #2 saved with ID: ${lead2Id}</div>
        <div class="step-item">Lead Name: ${lead2Name}</div>
        <div class="step-item">Email: ${sharedEmail} (same as Email_Opp#1)</div>
        <div class="step-item">Company Name: Company Name Lead 2</div>
        <div class="step-item">Contact Name: Contact Name Lead 2</div>
        <div class="step-item">Location: United States, Texas</div>
        <div class="step-item">Created Manually: FALSE</div>
        <div class="step-item">Lead Form: IB NC Leads</div>
        <div class="step-item">Application icon pressed</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Condition #3: Creating Lead #3 (Created Manually = FALSE, Lead Form = Download Free Trial)</div>
        <div class="step-item">Lead #3 creation form opened</div>
        <div class="step-item">Lead #3 saved with ID: ${lead3Id}</div>
        <div class="step-item">Lead Name: ${lead3Name}</div>
        <div class="step-item">Email: ${sharedEmail} (same as Email_Opp#1)</div>
        <div class="step-item">Company Name: Company Name Lead 3</div>
        <div class="step-item">Contact Name: Contact Name Lead 3</div>
        <div class="step-item">Location: United States, Texas</div>
        <div class="step-item">Created Manually: FALSE</div>
        <div class="step-item">Lead Form: Download Free Trial</div>
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
        <div class="step-item">Step 4.1: Lead form = IB NC Leads</div>
        <div class="step-item">Step 4.2: Active = TRUE</div>
        <div class="step-item">Step 4.3: Is Won = Pending</div>
        <div class="step-item">Step 4.4: Lost Reason = BLANK</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 5: Verify Log Area (Opp #1)</div>
        <div class="step-item">Step 5.1: Found log message: "${lead3Name}, has been merged into this lead."</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 6: Open Lead #2 (Potential Target - Stays Active)</div>
        <div class="step-item">Lead #2 opened successfully</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 7: Verify Lead #2 Fields (Stays Active)</div>
        <div class="step-item">Step 7.1: Tags contain "Renewal"</div>
        <div class="step-item">Step 7.2: Company Name = Company Name Opp 1 (auto set due to created Contact)</div>
        <div class="step-item">Step 7.3: Street = 123street</div>
        <div class="step-item">Step 7.4: Country = United States</div>
        <div class="step-item">Step 7.5: State = Texas</div>
        <div class="step-item">Step 7.6: Sales Team = verified</div>
        <div class="step-item">Step 7.7: Email = ${sharedEmail}</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 8: Verify CRM Developer Tab (Lead #2)</div>
        <div class="step-item">Step 8.1: Lead form = IB NC Leads</div>
        <div class="step-item">Step 8.2: Active = TRUE</div>
        <div class="step-item">Step 8.3: Is Won = Pending</div>
        <div class="step-item">Step 8.4: Lost Reason = BLANK</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 10: Open Lead #3 (Source - Merged)</div>
        <div class="step-item">Lead #3 opened successfully</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 11: Verify Lead #3 Fields (Source - Merged)</div>
        <div class="step-item">Step 11.1: Tags contain "Trial download"</div>
        <div class="step-item">Step 11.2: Company Name = Company Name Opp 1 (auto set due to created Contact)</div>
        <div class="step-item">Step 11.3: Street = 123street</div>
        <div class="step-item">Step 11.4: Country = United States</div>
        <div class="step-item">Step 11.5: State = Texas</div>
        <div class="step-item">Step 11.6: Sales Team = verified</div>
        <div class="step-item">Step 11.7: Email = ${sharedEmail}</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 12: Verify CRM Developer Tab (Lead #3)</div>
        <div class="step-item">Step 12.1: Lead form = Download Free Trial</div>
        <div class="step-item">Step 12.2: Active = FALSE</div>
        <div class="step-item">Step 12.3: Is Won = Lost</div>
        <div class="step-item">Step 12.4: Lost Reason = Duplicate</div>
      </div>
      
      <div class="step-group">
        <div class="step-group-title">Step 13: Verify Log Area (Lead #3)</div>
        <div class="step-item">Step 13.1: Found log message: "This lead has been merged into ${opp1Name}."</div>
      </div>
    </div>
    
    <div class="entity-section">
      <div class="entity-title">📋 Opp #1 - Target Opportunity (Active - Created First)</div>
      <div class="info-row"><span class="label">Opp ID:</span> ${opp1Id}</div>
      <div class="info-row"><span class="label">Opp Name:</span> ${opp1Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Renewal, Trial download</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Opp 1</div>
      <div class="info-row"><span class="label">Location:</span> Belgium, Flanders (BE)</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> IB NC Leads</div>
      <div class="info-row"><span class="label">Note:</span> Earlier lead (created first)</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">URL:</span> ${opp1Url}</div>
    </div>
    
    <div class="entity-section">
      <div class="entity-title">📋 Lead #2 - Potential Target Lead (Stays Active)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead2Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Renewal</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Opp 1 (auto-set)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> IB NC Leads</div>
      <div class="info-row"><span class="label">Note:</span> IB renewal but created later</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
    
    <div class="entity-section">
      <div class="entity-title">📋 Lead #3 - Source Lead (Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead3Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead3Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Trial download</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Opp 1 (auto-set)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial</div>
      <div class="info-row"><span class="label">Active:</span> FALSE</div>
      <div class="info-row"><span class="label">Is Won:</span> Lost</div>
      <div class="info-row"><span class="label">Lost Reason:</span> Duplicate</div>
      <div class="info-row"><span class="label">URL:</span> ${lead3Url}</div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Lead merging with 2 potential targets verified successfully<br>
        Opp #1 (earlier IB renewal) wins, Lead #2 (later IB renewal) stays active<br>
        Lead #3 (Download Free Trial) merged into Opp #1<br>
        Email: ${sharedEmail}<br>
        <br>
        <strong>All verification points passed</strong>
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 Two Leads Merging to Opp - Test Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
