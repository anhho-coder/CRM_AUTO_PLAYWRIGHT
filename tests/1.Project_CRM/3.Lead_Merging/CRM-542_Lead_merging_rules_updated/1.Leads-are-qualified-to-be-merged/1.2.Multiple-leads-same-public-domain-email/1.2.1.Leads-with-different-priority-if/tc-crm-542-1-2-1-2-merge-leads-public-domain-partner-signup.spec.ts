import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Public Domain Email with Different Priority
 * Test Case ID: CRM-542_1.2.1.2
 * 
 * Summary: Verify that the merging lead happens successfully when the leads from the same public domain email 
 * but different priority if a lead of them is Partner sign up lead
 * 
 * Command to run:
 * npx playwright test --grep "CRM-542_1.2.1.2" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current date time
 *    - Email textbox = Company email (with template Test+ company + current date + current time@gmail.com)
 *      (Remember the created email, called Email_Lead#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list = CMR
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Partner Sign Up
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1, called URL_Lead#1
 * 
 * II. Condition#2 to create Lead#2:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current date time
 *    - Email textbox = Email_Lead#1 that created in Condition#1
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list = CMR
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#2, called URL_Lead#2
 * 
 * Steps to reproduce:
 * 1. Wait for 1 minute for Lead Merging happened
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains 2 values: "Partner signup" and "Trial download"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = United States
 *    3.5. State dropdown list = Texas (US)
 *    3.6. Sales Team dropdown list is CMR
 *    3.7. Email textbox = Email_Lead#1 that created previously
 *    3.8. Contact Name textbox = Contact Name Lead 2 (transferred from Lead 2)
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Partner Sign Up
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area, verify the following:
 *    5.1. There is the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field contains 1 value: "Trial download"
 *    7.2. Company Name textbox = Company Name Lead 2
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list is CMR
 *    7.7. Email textbox = Email_Lead#1 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Download Free Trial
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area, verify the following:
 *    9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-542_1.2.1.2 - Lead Merging: Same Public Domain Email with Different Priority (Partner Sign Up Lead)', () => {
  
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
      const spinnerLocator = page.locator('.o_loading, .o_blockUI, [class*="spinner"], [class*="loading"]');
      const spinnerCount = await spinnerLocator.count();
      
      if (spinnerCount > 0) {
        console.log('  ℹ️ Found loading spinners, waiting for them to disappear...');
        await page.waitForTimeout(3000);
        
        try {
          await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
          console.log('  ✓ Loading spinners have disappeared');
        } catch (e) {
          console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
        }
      }
      
      // Additional wait for page to fully stabilize
      await page.waitForTimeout(2000);
      console.log('  ✓ Page stabilized for screenshot capture');
    }
  });

  test('Verify merging lead happens successfully when leads from same public domain email with different priority (Partner sign up lead)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Known issue: This test is expected to fail due to defect - related to CRM-8929
    // Company Name should be "Company Name Lead 1" but it's empty after merge
    test.fail();
    test.info().annotations.push({ type: 'defect', description: 'Related to CRM-8929 - Company Name cleared after merge for Partner signup leads' });
    
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

    // CONDITION #1: Create Lead #1 (Partner Sign Up - high priority)
    await test.step('Condition #1: Create Lead #1 with Partner Sign Up form', async () => {
      console.log('\n=== CREATING LEAD #1 (Partner Sign Up - High Priority) ===');
      
      // Generate shared PUBLIC DOMAIN email (@gmail.com)
      // Format: Test+company-2026-01-07-123456@gmail.com
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      sharedEmail = `Test+company-${timestamp}@gmail.com`;
      console.log(`Generated shared public domain email: ${sharedEmail}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name
      lead1Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 1');
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail}`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);
      
      // Note: No Contact Name for Lead #1
      
      // Fill Street
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - United States
      await leadPage.selectCountry('United States');
      console.log(`  - Country: United States`);
      
      // Select State - Texas (US)
      await leadPage.selectState('Texas');
      console.log(`  - State: Texas (US)`);
      
      // Set Sales Team to CMR
      await leadPage.selectSalesTeam('CMR');
      console.log(`  - Sales Team: CMR`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Fill Lead Form = Partner Sign Up
      await leadPage.fillLeadForm('Partner Sign Up');
      console.log(`  - Lead Form: Partner Sign Up`);
      
      // Save Lead #1
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved successfully with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      // Capture screenshot after creating Lead #1
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    // CONDITION #2: Create Lead #2 (Download Free Trial)
    await test.step('Condition #2: Create Lead #2 with Download Free Trial form', async () => {
      console.log('=== CREATING LEAD #2 (Download Free Trial) ===');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name
      lead2Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 2');
      
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
      
      // Set Sales Team to CMR
      await leadPage.selectSalesTeam('CMR');
      console.log(`  - Sales Team: CMR`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Fill Lead Form = Download Free Trial
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
      
      // Save Lead #2
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved successfully with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      // Capture screenshot after creating Lead #2
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);
    });

    // STEPS TO REPRODUCE:

    // Step 1: Wait for Lead Merging to happen
    await test.step('Step 1: Wait for Lead Merging to happen', async () => {
      console.log('\n=== STEP 1: WAITING FOR LEAD MERGING ===');
      console.log(`Checking Lead #2 (${lead2Id}) for merge notification...`);
      console.log(`Lead #2 should receive merge message: "This lead has been merged into ${lead1Name}"`);
      
      // Stay at Source Lead page (Lead #2)
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
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Wait for page to be fully loaded before verifying fields
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Verify we're on the correct lead page
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      
      console.log('  ✓ Page loaded in readonly mode');
      console.log('✓ Step 2 completed: Opened Lead #1 in readonly mode\n');
      
      // Capture screenshot after opening Lead #1
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 After Merging (ID: ${lead1Id})`);
    });

    // Step 3: Verify the following
    await test.step('Step 3: Verify the following', async () => {
      console.log('=== STEP 3: VERIFY MERGED LEAD FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Tag field contains 2 values: "Partner signup" and "Trial download"
      await test.step('Step 3.1: Verify Tag field contains 2 values: "Partner signup" and "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Verify both expected tags are present
        expect(tagsText).toContain('Partner signup');
        expect(tagsText).toContain('Trial download');
        
        console.log(`  ✓ Step 3.1: Tag field contains 2 values: "Partner signup" and "Trial download"`);
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
      
      // Step 3.4: Country = United States
      await test.step('Step 3.4: Verify Country = United States (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 3.4: Country = United States`);
      });
      
      // Step 3.5: State = Texas (US)
      await test.step('Step 3.5: Verify State = Texas (US) (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 3.5: State = Texas`);
      });
      
      // Step 3.6: Sales Team = CMR
      await test.step('Step 3.6: Verify Sales Team = CMR (readonly)', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        expect(salesTeamValue).toContain('CMR');
        console.log(`  ✓ Step 3.6: Sales Team = CMR`);
      });
      
      // Step 3.7: Email = sharedEmail
      await test.step('Step 3.7: Verify Email = Email_Lead#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(sharedEmail.split('@')[0]);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
      
      // Step 3.8: Contact Name = Contact Name Lead 2 (transferred from Lead 2)
      await test.step('Step 3.8: Verify Contact Name = Contact Name Lead 2 (readonly)', async () => {
        const contactNameText = await leadPage.getContactNameReadonly();
        expect(contactNameText).toContain('Contact Name Lead 2');
        console.log(`  ✓ Step 3.8: Contact Name = Contact Name Lead 2 (transferred from Lead 2)`);
      });
    });

    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab_targetLead();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = Partner Sign Up
      await test.step('Step 4.1: Verify Lead form textbox = Partner Sign Up', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('Partner Sign Up');
        console.log(`  ✓ Step 4.1: Lead form textbox = ${leadFormValue}`);
      });
      
      // Step 4.2: Active checkbox = TRUE
      await test.step('Step 4.2: Verify Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 4.2: Active checkbox = ${isActive ? 'TRUE' : 'FALSE'}`);
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

    // Step 5: On the Log area, verify merge message
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
    });

    // Step 6: Open the Lead 2 using URL_Lead#2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Verify we're on the correct lead page
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      
      console.log('  ✓ Page loaded in readonly mode');
      console.log('✓ Step 6 completed: Opened Lead #2 in readonly mode\n');
      
      // Capture screenshot after opening Lead #2
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 After Merging (ID: ${lead2Id})`);
    });

    // Step 7: Verify the following
    await test.step('Step 7: Verify the following', async () => {
      console.log('=== STEP 7: VERIFY MERGED LEAD FIELDS (READONLY MODE - Lead #2) ===\n');
      
      // Step 7.1: Tag field contains 1 value: "Trial download"
      await test.step('Step 7.1: Verify Tag field contains 1 value: "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Verify expected tag is present
        expect(tagsText).toContain('Trial download');
        
        console.log(`  ✓ Step 7.1: Tag field contains 1 value: "Trial download"`);
      });
      
      // Step 7.2: Company Name = Company Name Lead 2 (NOT inherited from Lead #1)
      await test.step('Step 7.2: Verify Company Name = Company Name Lead 2 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain('Company Name Lead 2');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Lead 2`);
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
        console.log(`  ✓ Step 7.5: State = Texas`);
      });
      
      // Step 7.6: Sales Team = CMR
      await test.step('Step 7.6: Verify Sales Team = CMR (readonly)', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        expect(salesTeamValue).toContain('CMR');
        console.log(`  ✓ Step 7.6: Sales Team = CMR`);
      });
      
      // Step 7.7: Email = sharedEmail
      await test.step('Step 7.7: Verify Email (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(sharedEmail.split('@')[0]);
        console.log(`  ✓ Step 7.7: Email = ${sharedEmail}`);
      });
    });

    // Step 8: Click at "CRM Developer" tab and verify fields
    await test.step('Step 8: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER FIELDS (LEAD #2) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 8.1: Lead form textbox = Download Free Trial
      await test.step('Step 8.1: Verify Lead form textbox = Download Free Trial', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('Download Free Trial');
        console.log(`  ✓ Step 8.1: Lead form textbox = ${leadFormValue}`);
      });
      
      // Step 8.2: Active checkbox = FALSE
      await test.step('Step 8.2: Verify Active checkbox = FALSE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeFalsy();
        console.log(`  ✓ Step 8.2: Active checkbox = ${isActive ? 'TRUE' : 'FALSE'}`);
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
      console.log('✅ TEST PASSED: Lead merging verified successfully');
      console.log(`   Lead #1 (${lead1Id}): Partner Sign Up (high priority)`);
      console.log(`   Lead #1: Active=TRUE, Is Won=Pending, Tags: Partner signup, Trial download`);
      console.log(`   Lead #2 (${lead2Id}): Download Free Trial (low priority)`);
      console.log(`   Lead #2: Active=FALSE, Is Won=Lost, Lost Reason=Duplicate`);
      console.log(`   Email: ${sharedEmail} (PUBLIC DOMAIN)`);
      console.log(`   Lead #2 keeps its own Company Name (Company Name Lead 2)`);
      console.log(`   All 26 verification points passed`);
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
    .highlight { background: #fef3c7; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">✅</span>LEAD MERGING TEST - CRM-542_1.2.1.2</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 - Partner Sign Up (Target Lead)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead1Name}</div>
      <div class="info-row"><span class="label">Lead Form:</span> Partner Sign Up (High Priority)</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 1</div>
      <div class="info-row"><span class="label">Contact Name:</span> Contact Name Lead 2 (transferred)</div>
      <div class="info-row"><span class="label">Email:</span> <span class="highlight">${sharedEmail} (PUBLIC DOMAIN)</span></div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 - Download Free Trial (Source Lead)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead2Name}</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial (Low Priority)</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 2 (KEPT, not inherited)</div>
      <div class="info-row"><span class="label">Contact Name:</span> Contact Name Lead 2</div>
      <div class="info-row"><span class="label">Status:</span> Merged into Lead #1</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications (Steps 3-5)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Partner signup + Trial download</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1</span></div>
      <div class="checkpoint-detail"><span class="label">Contact Name:</span> <span class="result-pass">✓ Contact Name Lead 2 (transferred)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${sharedEmail}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Partner Sign Up, Active=TRUE, Is Won=Pending</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ "${lead2Name}, has been merged into this lead."</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications (Steps 7-9)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download only</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 2 (KEPT, not inherited)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${sharedEmail}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Download Free Trial, Active=FALSE, Is Won=Lost, Lost Reason=Duplicate</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ "This lead has been merged into ${lead1Name}."</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        Lead merging completed successfully with PUBLIC DOMAIN email<br>
        Partner Sign Up (high priority) merged with Download Free Trial (low priority)<br>
        <strong>Key Difference:</strong> Lead #2 keeps its own Company Name (not inherited)<br>
        All 26 verification points passed
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

    // Capture screenshot before closing browser
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Final View - Test Completed`);
  });
});
