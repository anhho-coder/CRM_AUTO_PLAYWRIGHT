import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Company Email with Different Priority (Deal Registration)
 * Test Case ID: CRM-1992_1.1.1.1.4
 * 
 * Summary: Verify that the merging lead happens successfully when the leads with the same 
 * company email but different priority if a lower priority lead is created manually and has tag "can_merge" 
 * and the higher priority lead has Lead form = Register a Deal
 * 
 * Command to run:
 * npx playwright test --grep "CRM-1992_1.1.1.1.4" --project=chromium
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
 *    - Created manually checkbox = FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Register a Deal
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
 *    - Created manually checkbox = TRUE
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
 *    3.1. Tag field contains 2 values: "Can_Merge", "Deal registration"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Brussels Capital
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Register a Deal
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

test.describe('CRM-1992_1.1.1.1.4 - Lead Merging: Same Company Email with Deal Registration (Register a Deal)', () => {
  
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

  test('Verify merging leads with same company email (Register a Deal, Created Manually = TRUE, Deal Registration)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-1992_1.1.1.1.4';
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

    // CONDITION #1: Create Lead #1 (Created Manually = FALSE, Register a Deal)
    await test.step('Condition #1: Create Lead #1 (Created Manually = FALSE, Register a Deal)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Created Manually = FALSE, Register a Deal) ===');
      
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

      // Fill Lead Form = Register a Deal
      await leadPage.fillLeadForm('Register a Deal');
      console.log(`  - Lead Form: Register a Deal`);
      
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
      
      // Check "Created Manually" to TRUE
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

    // STEP 3: Verify Lead #1 fields
    await test.step('Step 3: Verify the following fields on Lead #1', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Verify Tags contain "Can_Merge", "Deal registration"
      await test.step('Step 3.1: Tag field contains "Can_Merge", "Deal registration"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Can_Merge');
        expect(tagsText).toContain('Deal registration');
        console.log(`  ✓ Step 3.1: Tags contain "Can_Merge" and "Deal registration"`);
      });

      // Step 3.2: Verify Company Name
      await test.step('Step 3.2: Company Name textbox = Company Name Lead 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 3.2: Company Name = Company Name Lead 1`);
      });

      // Step 3.3: Verify Street
      await test.step('Step 3.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 3.3: Street = 123street`);
      });

      // Step 3.4: Verify Country
      await test.step('Step 3.4: Country dropdown list = Belgium', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Belgium');
        console.log(`  ✓ Step 3.4: Country = Belgium`);
      });

      // Step 3.5: Verify State
      await test.step('Step 3.5: State dropdown list = Brussels Capital', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Brussels Capital');
        console.log(`  ✓ Step 3.5: State = Brussels Capital`);
      });

      // Step 3.6: Verify Sales Team (has a value or not)
      await test.step('Step 3.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 3.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 3.7: Verify Email
      await test.step('Step 3.7: Email textbox = Email_Lead#1', async () => {
        const email = await leadPage.getEmailReadonly();
        
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
    });

    // STEP 4: Verify Lead #1 CRM Developer tab
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER TAB (LEAD #1) ===\n');
      
      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 4.1: Verify Lead form
      await test.step('Step 4.1: Lead form textbox = Register a Deal', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('Register a Deal');
        console.log(`  ✓ Step 4.1: Lead form = ${leadForm}`);
      });

      // Step 4.2: Verify Active checkbox
      await test.step('Step 4.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 4.2: Active = TRUE`);
      });

      // Step 4.3: Verify Is Won
      await test.step('Step 4.3: Is Won = Pending', async () => {
        const isWon = await leadPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 4.3: Is Won = ${isWon}`);
      });

      // Step 4.4: Verify Lost Reason is BLANK
      await test.step('Step 4.4: Lost Reason = BLANK', async () => {
         const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
      });
    });

    // STEP 5: Verify Log area on Lead #1
    await test.step('Step 5: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA (LEAD #1) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 5.1: Verify merge message
      await test.step('Step 5.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasSourceLeadMergeMessage(lead2Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 5.1: Found log message: "${lead2Name}, has been merged into this lead."`);
      });

      // Step 5.2: Verify Deal registration tab
      await test.step('Step 5.2: Click at "Deal registration" tab and verify', async () => {
        console.log('\n  --- Step 5.2: Verify Deal Registration Tab ---');
        
        // Click on Deal Registration tab
        await leadPage.clickDealRegistrationTab();
        await page.waitForTimeout(CommonUtils.waitTimes.standard);
        console.log('  ✓ Clicked Deal Registration tab');
        
        // Get current date for comparison
        const currentDate = CommonUtils.formatDate();
        
        // Verify Registered deal checkbox is TRUE
        const isRegisteredDealChecked = await leadPage.isRegisteredDealChecked();
        expect(isRegisteredDealChecked).toBeTruthy();
        console.log('  ✓ Registered deal checkbox = TRUE');
        
        // Verify Deal registration start date
        const startDateValue = await leadPage.getDealRegistrationStartDate();
        expect(startDateValue).toBe(currentDate);
        console.log(`  ✓ Deal registration start date = ${currentDate}`);
        
        // Verify Deal registration end date
        const endDateValue = await leadPage.getDealRegistrationEndDate();
        expect(endDateValue).toBe(currentDate);
        console.log(`  ✓ Deal registration end date = ${currentDate}`);
      });
    });

    // STEP 6: Open Lead #2
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
      
      // Step 7.1: Verify Tags contain "Can_Merge"
      await test.step('Step 7.1: Tag field contains "Can_Merge"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Can_Merge');
        console.log(`  ✓ Step 7.1: Tags contain "Can_Merge"`);
      });

      // Step 7.2: Verify Company Name (auto set due to created Contact)
      await test.step('Step 7.2: Company Name textbox = Company Name Lead 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Lead 1 (auto set due to created Contact)`);
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
      await test.step('Step 7.5: State dropdown list = Texas (US)', async () => {
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
      await test.step('Step 7.7: Email textbox = Email_Lead#1', async () => {
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
      await test.step('Step 8.1: Lead form textbox = BLANK', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('');
        console.log(`  ✓ Step 8.1: Lead form = BLANK`);
      });

      // Step 8.2: Verify Active checkbox
      await test.step('Step 8.2: Active checkbox = FALSE', async () => {
        const isActive = await leadPage.isActiveChecked();
        
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 8.2: Active = FALSE`);
      });

      // Step 8.3: Verify Is Won
      await test.step('Step 8.3: Is Won = Lost', async () => {
        const isWon = await leadPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Lost');
        console.log(`  ✓ Step 8.3: Is Won = ${isWon}`);
      });

      // Step 8.4: Verify Lost Reason = Duplicate
      await test.step('Step 8.4: Lost Reason = Duplicate', async () => {
         const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        
        expect(lostReasonValue).toBe('Duplicate');
        console.log(`  ✓ Step 8.4: Lost Reason = ${lostReasonValue}`);
      });
    });

    // STEP 9: Verify Log area on Lead #2
    await test.step('Step 9: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 9: VERIFY LOG AREA (LEAD #2) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 9.1: Verify merge message
      await test.step('Step 9.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(lead1Name);
        
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 9.1: Found log message: "This lead has been merged into ${lead1Name}."`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: Lead merging with Deal Registration (Register a Deal) verified successfully');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Is Won=Pending, Tags: Can_Merge, Deal registration`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: Register a Deal`);
      console.log(`   - Deal Registration: TRUE (cloned from Lead#2)`);
      console.log(`   Lead #2 (${lead2Id}): Active=FALSE, Is Won=Lost, Lost Reason=Duplicate`);
      console.log(`   - Created Manually: TRUE`);
      console.log(`   - Lead Form: BLANK (after merge)`);
      console.log(`   - Deal Registration: TRUE (configured on Lead#2)`);
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
    .lead-section { background: #dcfce7; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .lead-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
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
      <h2><span class="icon">\u2705</span>LEAD MERGING TEST - PASSED (Register a Deal)</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">\ud83d\udccb Lead #1 - Target Lead (Active)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead1Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Can_Merge, Deal registration</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 1</div>
      <div class="info-row"><span class="label">Location:</span> Brussels Capital, Belgium</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> Register a Deal</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">Deal Registration:</span> TRUE</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">\ud83d\udccb Lead #2 - Source Lead (Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead2Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${sharedEmail}</div>
      <div class="info-row"><span class="label">Tags:</span> Can_Merge</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 1 (auto-set)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">Created Manually:</span> TRUE</div>
      <div class="info-row"><span class="label">Lead Form:</span> BLANK</div>
      <div class="info-row"><span class="label">Active:</span> FALSE</div>
      <div class="info-row"><span class="label">Is Won:</span> Lost</div>
      <div class="info-row"><span class="label">Lost Reason:</span> Duplicate</div>
      <div class="info-row"><span class="label">Deal Registration:</span> TRUE</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
    
    <div class="summary">
      <div class="summary-title">\u2705 TEST PASSED</div>
      <div class="summary-text">
        Lead merging with Deal Registration (Register a Deal) verified successfully<br>
        Lead #2 (Deal Registration) merged into Lead #1 (Register a Deal)<br>
        Email: ${sharedEmail}<br>
        <br>
        <strong>All verification points passed</strong>
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('\ud83d\udccb Lead Merging (Register a Deal) - Test Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
