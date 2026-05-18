import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Public Email with Different Priority (Manual Can_Merge vs Subscribe Form)
 * Test Case ID: CRM-1992_1.2.1.2.1
 * 
 * ⚠️ KNOWN ISSUE: Blocked by bug CRM-8929 - Test marked with test.fail() until bug is resolved
 * 
 * Summary: Verify that the merging lead happens successfully when the leads with the same public email 
 * but different priority if a higher priority lead is created manually and has tag "can_merge" and 
 * the lower priority lead has Lead form = Subscribe Form
 * 
 * Command to run:
 * npx playwright test --grep "CRM-1992_1.2.1.2.1" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current TC ID
 *    - Email textbox = Public email (with template "Test + current date + current time" + @gmail.com)
 *      (Remember the created email, called Email_Lead#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Brussels Capital
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is TRUE
 *    - Tags = "Can_Merge"
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = BLANK
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
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Subscribe Form
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
 *    3.1. Tag field contains 1 value: "Can_Merge"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Brussels Capital
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = BLANK
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
 *    7.1. Tag field contains nothing
 *    7.2. Company Name textbox = Company Name Lead 1 (auto set due to created Contact)
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list has a value or not
 *    7.7. Email textbox = Email_Lead#1 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Subscribe Form
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area, verify the following:
 *    9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-1992_1.2.1.2.1 - Lead Merging: Same Public Email (Manual Can_Merge vs Subscribe Form)', () => {
  
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

  test('Verify merging lead happens successfully when leads have same public email with manual Can_Merge vs Subscribe Form', async ({ page }, testInfo) => {
    // Known bug: CRM-8929 - Test expected to fail until bug is resolved
    testInfo.annotations.push({ type: 'defect', description: 'CRM-8929' });
    test.fail(); // Mark as expected to fail due to known defect
    
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    let sharedEmail: string;
    let lead1Name: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;
    const currentDate = CommonUtils.formatDate();

    // Step 1: Login
    await test.step('Step 1: Login and navigate to CRM', async () => {
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
      
      console.log('✓ Navigated to Leads page');
    });

    // CONDITION #1: Create Lead #1 (Manual with Can_Merge tag, No Lead Form)
    await test.step('Condition #1: Create Lead #1 (Manual with Can_Merge tag)', async () => {
      console.log('\n=== CREATING LEAD #1 (Manual with Can_Merge tag) ===');
      
      // Generate public email (gmail.com) - using timestamp for uniqueness
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;
      sharedEmail = `Test${timestamp}@gmail.com`;
      console.log(`Generated shared public email: ${sharedEmail}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name with TC ID
      lead1Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 1 CRM-1992_1.2.1.2.1');
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail}`);
      
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
      
      // Check "Created Manually"
      const checked = await leadPage.checkCreatedManually();
      console.log(`  - Created Manually: ${checked ? 'Checked (TRUE)' : 'Already checked'}`);
      
      // Add Tag "Can_Merge"
      await leadPage.addTag('Can_Merge');
      console.log(`  - Tags: Can_Merge`);
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log(`  - Clicked CRM Developer tab`);
      
      // Leave Lead Form BLANK (do not fill anything)
      console.log(`  - Lead Form: BLANK (not filled)`);
      
      // Save Lead #1
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved successfully with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      // Capture screenshot after creating
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition 1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    // CONDITION #2: Create Lead #2 (Subscribe Form with Deal Registration)
    await test.step('Condition #2: Create Lead #2 (Subscribe Form with Deal Registration)', async () => {
      console.log('=== CREATING LEAD #2 (Subscribe Form with Deal Registration) ===');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name with TC ID
      lead2Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 2 CRM-1992_1.2.1.2.1');
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      // Use the same email from Lead #1
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Lead #1)`);
      
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
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Click CRM Developer tab and fill Lead Form
      await leadPage.clickCRMDeveloperTab();
      console.log(`  - Clicked CRM Developer tab`);
      
      // Fill Lead Form = Subscribe Form
      await leadPage.fillLeadForm('Subscribe Form');
      console.log(`  - Lead Form: Subscribe Form`);
      
      // Save Lead #2 (first save)
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved successfully with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}`);
      
      // Press EDIT button
      await leadPage.clickEdit();
      console.log('✓ Clicked EDIT button');
      
      // Wait for lead form to fully load in edit mode
      await leadPage.waitForLeadFormToLoad(config.timeouts.loadingSpinner, 15000);
      
      // Click "Deal registration" tab
      await leadPage.clickDealRegistrationTab();
      console.log('✓ Clicked Deal registration tab');
      
      // Fill Deal Registration fields
      await leadPage.checkRegisteredDeal();
      console.log(`  - Registered deal: TRUE`);
      
      await leadPage.fillDealRegistrationStartDate(currentDate);
      console.log(`  - Deal registration start date: ${currentDate}`);
      
      await leadPage.fillDealRegistrationEndDate(currentDate);
      console.log(`  - Deal registration end date: ${currentDate}`);
      
      // Save Lead #2 again (second save with Deal Registration)
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      console.log(`✓ Lead #2 saved again with Deal Registration data\n`);

      // Capture screenshot after creating
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition 2 - Lead #2 Created with Deal Registration (ID: ${lead2Id})`);
    });

    // STEPS TO REPRODUCE:

    // Step 1: Wait for Lead Merging to happen by checking for merge notification
    await test.step('Step 1: Wait for Lead Merging to happen', async () => {
      console.log('\n=== STEP 1: WAITING FOR LEAD MERGING ===');
      console.log(`Checking Lead #2 (${lead2Id}) for merge notification...`);
      console.log(`Lead #2 should receive merge message: "This lead has been merged into ${lead1Name}"`);
      
      // Stay at current Lead page (Lead #2)
      await leadPage.wait(CommonUtils.waitTimes.long);
      
      const maxAttempts = 6;
      let mergeNotificationFound = false;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`Attempt ${attempt}/${maxAttempts}: Checking for merge notification on Lead #2...`);
        
        // Refresh the page to get latest state
        await page.reload({ waitUntil: 'domcontentloaded' });
        
        // Wait for page to be fully loaded
        await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);        
        
        // Check if chatter log contains merge message (Lead #2 merged into Lead #1)
        const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(lead1Name);
        if (hasMergeMessage) {
          console.log(`✓ Merge message found on Lead #2: "This lead has been merged into ${lead1Name}"`);
          mergeNotificationFound = true;
          break;
        }
        
        console.log(`  ℹ️ Merge message not yet found (attempt ${attempt}/${maxAttempts})`);
        
        // Wait 30 seconds before next attempt (only if not the last attempt)
        if (attempt < maxAttempts) {
          console.log(`  ⏳ Waiting 30 seconds before next refresh...`);
          await page.waitForTimeout(30000);
        }
      }
      
      // Assert that merge notification was found
      expect(mergeNotificationFound).toBeTruthy();
      console.log('✓ Step 1 completed: Lead merging confirmed\n');
    });

    // Step 2: Open the Lead 1 using URL_Lead#1
    await test.step('Step 2: Open the Lead 1 using URL_Lead#1', async () => {
      console.log('=== STEP 2: OPEN LEAD #1 ===');
      console.log(`Navigating to Lead #1 URL: ${lead1Url}`);
      
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Verify we're on the correct lead page
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      if (!currentUrl.includes(`id=${lead1Id}`)) {
        console.log(`  ⚠️ Warning: Expected Lead ID ${lead1Id} but current URL is: ${currentUrl}`);
      }
      
      console.log('✓ Step 2 completed: Opened Lead #1\n');
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 After Merging (ID: ${lead1Id})`);
    });

    // Step 3: Verify the following
    await test.step('Step 3: Verify Lead #1 fields', async () => {
      console.log('=== STEP 3: VERIFY MERGED LEAD #1 FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Tag field contains 1 value: "Can_Merge"
      await test.step('Step 3.1: Verify Tag field contains 1 value: "Can_Merge"', async () => {
        const tagsText = await leadPage.getTagsText();
        expect(tagsText).toContain('Can_Merge');
        console.log(`  ✓ Step 3.1: Tag field contains: "Can_Merge"`);
      });
      
      // Step 3.2: Company Name = Company Name Lead 1
      await test.step('Step 3.2: Verify Company Name = Company Name Lead 1 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 3.2: Company Name = Company Name Lead 1`);
      });
      
      // Step 3.3: Street = 123street
      await test.step('Step 3.3: Verify Street = 123street (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 3.3: Street = 123street`);
      });
      
      // Step 3.4: Country = Belgium
      await test.step('Step 3.4: Verify Country = Belgium (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Belgium');
        console.log(`  ✓ Step 3.4: Country = Belgium`);
      });
      
      // Step 3.5: State = Brussels Capital
      await test.step('Step 3.5: Verify State = Brussels Capital (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Brussels Capital');
        console.log(`  ✓ Step 3.5: State = Brussels Capital`);
      });
      
      // Step 3.6: Sales Team dropdown list has a value or not
      await test.step('Step 3.6: Check Sales Team value', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        console.log(`  ✓ Step 3.6: Sales Team = ${salesTeamValue || 'BLANK'}`);
      });
      
      // Step 3.7: Email = sharedEmail
      await test.step('Step 3.7: Verify Email = Email_Lead#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(sharedEmail.split('@')[0]);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
    });

    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Verify CRM Developer fields (Lead #1)', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab_targetLead();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = BLANK
      await test.step('Step 4.1: Verify Lead form textbox = BLANK', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('');
        console.log(`  ✓ Step 4.1: Lead form textbox = BLANK`);
      });
      
      // Step 4.2: Active checkbox = TRUE
      await test.step('Step 4.2: Verify Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 4.2: Active checkbox = TRUE`);
      });
      
      // Step 4.3: Is Won = Pending
      await test.step('Step 4.3: Verify Is Won = Pending', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Pending');
        console.log(`  ✓ Step 4.3: Is Won = ${isWonValue}`);
      });
      
      // Step 4.4: Lost Reason = BLANK
      await test.step('Step 4.4: Verify Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
      });
    });

    // Step 5: On the Log area and Deal registration tab
    await test.step('Step 5: Verify Log area and Deal registration tab (Lead #1)', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA AND DEAL REGISTRATION (LEAD #1) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
        
      // Step 5.1: Verify merge message
      await test.step('Step 5.1: Verify merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasSourceLeadMergeMessage(lead2Name);
        expect(hasMergeMessage).toBeTruthy();
        console.log(`  ✓ Step 5.1: Found log message: "${lead2Name}, has been merged into this lead."`);
      });
      
      // Step 5.2: Click at "Deal registration" tab and verify
      await test.step('Step 5.2: Verify Deal registration tab', async () => {
        // Click Deal registration tab
        await leadPage.clickDealRegistrationTab();
        console.log('  ✓ Clicked Deal registration tab');
        
        // Verify Registered deal checkbox = TRUE
        const isRegisteredDealChecked = await leadPage.isRegisteredDealChecked();
        expect(isRegisteredDealChecked).toBeTruthy();
        console.log(`  ✓ Registered deal checkbox = TRUE`);
        
        // Verify Deal registration start date = Current Date
        const startDate = await leadPage.getDealRegistrationStartDate();
        expect(startDate).toContain(currentDate);
        console.log(`  ✓ Deal registration start date = ${currentDate}`);
        
        // Verify Deal registration end date = Current Date
        const endDate = await leadPage.getDealRegistrationEndDate();
        expect(endDate).toContain(currentDate);
        console.log(`  ✓ Deal registration end date = ${currentDate}`);
      });
    });

    // Step 6: Open the Lead 2 using URL_Lead#2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Verify we're on the correct lead page
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      if (!currentUrl.includes(`id=${lead2Id}`)) {
        console.log(`  ⚠️ Warning: Expected Lead ID ${lead2Id} but current URL is: ${currentUrl}`);
      }
      
      console.log('✓ Step 6 completed: Opened Lead #2\n');
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 After Merging (ID: ${lead2Id})`);
    });

    // Step 7: Verify the following
    await test.step('Step 7: Verify Lead #2 fields', async () => {
      console.log('=== STEP 7: VERIFY MERGED LEAD #2 FIELDS (READONLY MODE) ===\n');
      
      // Step 7.1: Tag field contains nothing
      await test.step('Step 7.1: Verify Tag field contains nothing', async () => {
        const tagsText = await leadPage.getTagsText();
        expect(tagsText.trim()).toBe('');
        console.log(`  ✓ Step 7.1: Tag field is empty`);
      });
      
      // Step 7.2: Company Name = Company Name Lead 1 (auto set due to created Contact)
      await test.step('Step 7.2: Verify Company Name = Company Name Lead 1 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Lead 1 (auto set)`);
      });
      
      // Step 7.3: Street = 123street
      await test.step('Step 7.3: Verify Street = 123street (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 7.3: Street = 123street`);
      });
      
      // Step 7.4: Country = United States
      await test.step('Step 7.4: Verify Country = United States (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 7.4: Country = United States`);
      });
      
      // Step 7.5: State = Texas (US)
      await test.step('Step 7.5: Verify State = Texas (US) (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 7.5: State = Texas (US)`);
      });
      
      // Step 7.6: Sales Team dropdown list has a value or not
      await test.step('Step 7.6: Check Sales Team value', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        console.log(`  ✓ Step 7.6: Sales Team = ${salesTeamValue || 'BLANK'}`);
      });
      
      // Step 7.7: Email = sharedEmail
      await test.step('Step 7.7: Verify Email (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(sharedEmail.split('@')[0]);
        console.log(`  ✓ Step 7.7: Email = ${sharedEmail}`);
      });
    });

    // Step 8: Click at "CRM Developer" tab and verify fields
    await test.step('Step 8: Verify CRM Developer fields (Lead #2)', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER FIELDS (LEAD #2) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 8.1: Lead form textbox = Subscribe Form
      await test.step('Step 8.1: Verify Lead form textbox = Subscribe Form', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('Subscribe Form');
        console.log(`  ✓ Step 8.1: Lead form textbox = ${leadFormValue}`);
      });
      
      // Step 8.2: Active checkbox = FALSE
      await test.step('Step 8.2: Verify Active checkbox = FALSE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 8.2: Active checkbox = FALSE`);
      });
      
      // Step 8.3: Is Won = Lost
      await test.step('Step 8.3: Verify Is Won = Lost', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Lost');
        console.log(`  ✓ Step 8.3: Is Won = ${isWonValue}`);
      });
      
      // Step 8.4: Lost Reason = Duplicate
      await test.step('Step 8.4: Verify Lost Reason = Duplicate', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('Duplicate');
        console.log(`  ✓ Step 8.4: Lost Reason = ${lostReasonValue}`);
      });
    });

    // Step 9: On the Log area, verify merge message
    await test.step('Step 9: Verify Log area (Lead #2)', async () => {
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
      console.log('✅ TEST PASSED: Lead merging verified successfully');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Is Won=Pending, Tags: Can_Merge`);
      console.log(`   Lead #1 received Deal Registration data from Lead #2`);
      console.log(`   Lead #2 (${lead2Id}): Active=FALSE, Is Won=Lost, Lost Reason=Duplicate`);
      console.log(`   Email: ${sharedEmail}`);
      console.log(`   All verification points passed`);
      console.log('==================================================\n');
      
      // Attach verification summary as HTML
      const verificationSummaryHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #2563eb; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .lead-section { background: #f0f9ff; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #2563eb; }
    .lead-title { font-weight: bold; color: #1e40af; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #1e40af; }
    .checkpoint { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .checkpoint-detail { margin: 8px 0; padding-left: 10px; }
    .result-pass { color: #16a34a; font-weight: bold; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #166534; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>LEAD MERGING TEST - CRM-1992_1.2.1.2.1</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 (Target) - Manual Can_Merge</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
      <div class="info-row"><span class="label">Priority:</span> Higher (Manual + Can_Merge tag)</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 (Source) - Subscribe Form</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
      <div class="info-row"><span class="label">Priority:</span> Lower (Subscribe Form)</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Can_Merge</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Brussels Capital, Belgium</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Lead Form=BLANK, Active=TRUE, Is Won=Pending</span></div>
      <div class="checkpoint-detail"><span class="label">Deal Registration:</span> <span class="result-pass">✓ Cloned from Lead #2 (Date: ${currentDate})</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ "${lead2Name}, has been merged into this lead."</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Empty</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1 (auto-set)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Subscribe Form, Active=FALSE, Is Won=Lost, Lost Reason=Duplicate</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ "This lead has been merged into ${lead1Name}."</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Lead merging completed successfully<br>
        Lead #1 (${lead1Id}): Active, received Deal Registration data<br>
        Lead #2 (${lead2Id}): Inactive (Lost - Duplicate)<br>
        Email: ${sharedEmail}
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 Lead Merging Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
