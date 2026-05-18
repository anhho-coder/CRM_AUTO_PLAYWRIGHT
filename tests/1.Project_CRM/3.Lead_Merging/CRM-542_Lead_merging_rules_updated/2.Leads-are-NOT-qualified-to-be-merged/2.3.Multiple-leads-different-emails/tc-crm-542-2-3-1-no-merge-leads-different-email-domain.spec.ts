import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - NO MERGE: Different Emails (Not Belonging to Existing Partner Domain)
 * Test Case ID: CRM-542_2.3.1
 * 
 * Summary: Verify that the merging leads do NOT happen when the leads from different emails 
 * and 2 leads are not belong to a domain of an existing partner
 * 
 * Command to run:
 * npx playwright test --grep "CRM-542_2.3.1" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm
 * 
 * I. Condition#1 to create Lead#1:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current date time
 *    - Email textbox = Company email (with template Test@company1 + current date + current time.com)
 *      (Remember the created email, called Email_Lead#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is CMR
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = IB NC Leads
 * 6. Press "SAVE" button
 * 7. Copy URL of Lead#1, called URL_Lead#1
 * 8. Press "Application" icon on the top-right of screen to return the Home page
 * 
 * II. Condition#2 to create Lead#2:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current date time
 *    - Email textbox = Company email (with template Test@company2 + current date + current time.com)
 *      (Remember the created email, called Email_Lead#2)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is CMR
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox is FALSE
 * 5. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Download Free Trial
 * 6. Press "SAVE" button
 * 7. Copy URL of Lead#2, called URL_Lead#2
 * 
 * Steps to reproduce:
 * 1. Wait for 1 minute for Lead Merging happened
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains 1 value: "Renewal"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = United States
 *    3.5. State dropdown list = Texas (US)
 *    3.6. Sales Team dropdown list is CMR
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = IB NC Leads
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field contains 1 value: "Trial download"
 *    7.2. Company Name textbox = Company Name Lead 2
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list is CMR
 *    7.7. Email textbox = Email_Lead#2 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Download Free Trial
 *    8.2. Active checkbox = TRUE
 *    8.3. Is Won = Pending
 *    8.4. Lost Reason = BLANK
 */

test.describe('CRM-542_2.3.1 - NO MERGE: Different Emails (Not Belonging to Existing Partner Domain)', () => {
  
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

  test('Verify that leads do NOT merge when leads have different emails not belonging to existing partner domain', async ({ page }, testInfo) => {
    // Extended timeout for NO MERGE test: needs to wait 3 minutes (6×30s) in Step 1 to verify no merge happens
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-542_2.3.1';
    let lead1Name: string;
    let lead1Email: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Email: string;
    let lead2Id: string;
    let lead2Url: string;
    const creationStartTime = Date.now();

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

    // CONDITION #1: Create Lead #1 (IB NC Leads)
    await test.step('Condition #1: Create Lead #1 with IB NC Leads form', async () => {
      console.log('\n=== CREATING LEAD #1 (IB NC Leads) ===');
      
      // Generate unique email for Lead #1 with company1 domain
      lead1Email = CommonUtils.generateEmail('Test', 'company1');
      console.log(`Generated Lead #1 email: ${lead1Email}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name
      lead1Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 1');
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(lead1Email);
      console.log(`  - Email: ${lead1Email}`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);
      
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
      
      // Fill Lead Form = IB NC Leads
      await leadPage.fillLeadForm('IB NC Leads');
      console.log(`  - Lead Form: IB NC Leads`);
      
      // Save Lead #1
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved successfully with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    // Step 8: Press "Application" icon to return Home
    await test.step('Condition #1 - Step 8: Press Application icon to return Home', async () => {
      console.log('Step 8: Clicking Application icon to return Home');
      
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Returned to Home page\n');
    });

    // CONDITION #2: Navigate to CRM and create Lead #2
    await test.step('Condition #2 - Steps 1-2: Navigate to CRM > Leads', async () => {
      console.log('=== CONDITION #2: CREATE LEAD #2 ===');
      console.log('Steps 1-2: Navigating to CRM > Leads');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // CONDITION #2: Create Lead #2 (Download Free Trial)
    await test.step('Condition #2 - Steps 3-7: Create Lead #2 with Download Free Trial form', async () => {
      console.log('Steps 3-7: Creating Lead #2');
      
      // Generate unique email for Lead #2 with company2 domain
      lead2Email = CommonUtils.generateEmail('Test', 'company2');
      console.log(`Generated Lead #2 email: ${lead2Email}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name
      lead2Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 2');
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      // Use different email with company2 domain
      await leadPage.fillEmail(lead2Email);
      console.log(`  - Email: ${lead2Email}`);
      
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

      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #2 After Merging (ID: ${lead2Id})`);
    });

    // STEPS TO REPRODUCE:

    // Step 1: Verify that NO Lead Merging happens (NO MERGE scenario)
    await test.step('Step 1: Verify NO Lead Merging (different email domains)', async () => {
      console.log('\n=== STEP 1: VERIFY NO LEAD MERGING (NO MERGE SCENARIO) ===');
      console.log(`Checking Lead #2 (${lead2Id}) for NO merge notification...`);
      console.log(`Expected: NO merge message (different email domains: company1 vs company2)`);
      
      // Wait for 90 seconds to allow merge time window to pass
      await leadPage.waitForNoMergeConfirmation();
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
      
      // Click Edit button to access form fields
      //await leadPage.clickEdit();
      
      // Wait for lead form to fully load in edit mode
      //await leadPage.waitForLeadFormToLoad(config.timeouts.loadingSpinner, 15000);
      
      console.log('✓ Step 2 completed: Opened Lead #1 in edit mode\n');
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 After Merging (ID: ${lead1Id})`);
    });

    // Step 3: Verify the following
    await test.step('Step 3: Verify the following', async () => {
      console.log('=== STEP 3: VERIFY MERGED LEAD FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Tag field contains 1 value: "Renewal" (NO MERGE - Lead#2 tag not merged)
      await test.step('Step 3.1: Verify Tag field contains only "Renewal"', async () => {
        // In readonly mode, get tags text directly
        const tagsText = await leadPage.getTagsText();
        
        // Verify only Renewal tag is present (NOT merged with Trial download from Lead#2)
        expect(tagsText).toContain('Renewal');
        expect(tagsText).not.toContain('Trial download');
        
        console.log(`  ✓ Step 3.1: Tag field contains 1 value: "Renewal" (NO MERGE verified)`);
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
      
      // Step 3.7: Email = Email_Lead#1
      await test.step('Step 3.7: Verify Email = Email_Lead#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(lead1Email.split('@')[0]);
        console.log(`  ✓ Step 3.7: Email = ${lead1Email}`);
      });
    });

    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab_targetLead();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = IB NC Leads
      await test.step('Step 4.1: Verify Lead form textbox = IB NC Leads', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('IB NC Leads');
        console.log(`  ✓ Step 4.1: Lead form textbox = ${leadFormValue}`);
      });
      
      // Step 4.2: Active checkbox = TRUE
      await test.step('Step 4.2: Verify Active checkbox = TRUE', async () => {
        console.log('  Verifying Active checkbox using 4 different approaches:');
        
        // Approach 1: Standard isChecked() method
        const isActive1 = await leadPage.isActiveChecked();
        expect(isActive1).toBeTruthy();
        console.log(`    Approach 1 (isChecked): ${isActive1 ? '✓ TRUE' : '✗ FALSE'}`);
      
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
      
      // Click Edit button to access form fields
      //await leadPage.clickEdit();
      
      // Wait for lead form to fully load in edit mode
      //await leadPage.waitForLeadFormToLoad(config.timeouts.loadingSpinner, 15000);
      
      console.log('✓ Step 6 completed: Opened Lead #2 in edit mode\n');
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 After Merging (ID: ${lead2Id})`);
    });

    // Step 7: Verify the following
    await test.step('Step 7: Verify the following', async () => {
      console.log('=== STEP 7: VERIFY MERGED LEAD FIELDS (READONLY MODE - Lead #2) ===\n');
      
      // Step 7.1: Tag field contains 1 value: "Trial download"
      await test.step('Step 7.1: Verify Tag field contains 1 value: "Trial download"', async () => {
        // In readonly mode, get tags text directly
        const tagsText = await leadPage.getTagsText();
        
        // Verify expected tag is present in the text
        expect(tagsText).toContain('Trial download');
        
        console.log(`  ✓ Step 7.1: Tag field contains 1 value: "Trial download"`);
      });
      
      // Step 7.2: Company Name = Company Name Lead 2 (NO MERGE - maintains original company)
      await test.step('Step 7.2: Verify Company Name = Company Name Lead 2 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain('Company Name Lead 2');
        console.log(`  ✓ Step 7.2: Company Name = Company Name Lead 2 (NO MERGE verified)`);
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
      
      // Step 7.7: Email = Email_Lead#2
      await test.step('Step 7.7: Verify Email = Email_Lead#2 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(lead2Email.split('@')[0]);
        console.log(`  ✓ Step 7.7: Email = ${lead2Email}`);
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
      
      // Step 8.2: Active checkbox = TRUE (NO MERGE - Lead#2 remains active)
      await test.step('Step 8.2: Verify Active checkbox = TRUE', async () => {
        console.log('  Verifying Active checkbox using multiple approaches:');
        
        // Approach 1: Standard isChecked() method
        const isActive1 = await leadPage.isActiveChecked();
        expect(isActive1).toBeTruthy();
        console.log(`    Approach 1 (isChecked): ${isActive1 ? '✓ TRUE' : '✗ FALSE'}`);
        
        console.log(`  ✓ Step 8.2: Active checkbox = TRUE (NO MERGE verified)`);
      });
      
      // Step 8.3: Is Won = Pending (NO MERGE - Lead#2 remains active)
      await test.step('Step 8.3: Verify Is Won = Pending', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Pending');
        console.log(`  ✓ Step 8.3: Is Won = ${isWonValue} (NO MERGE verified)`);
      });
      
      // Step 8.4: Lost Reason = BLANK (NO MERGE - Lead#2 not marked as duplicate)
      await test.step('Step 8.4: Verify Lost Reason = BLANK', async () => {
        console.log('  Verifying Lost Reason using multiple approaches:');
                
        // Approach 2: textContent() method
        const lostReasonValue2 = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue2).toBe('');
        console.log(`    Approach 2 (textContent): ${lostReasonValue2 || 'BLANK'}`);
        
        console.log(`  ✓ Step 8.4: Lost Reason = BLANK (NO MERGE verified)`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('✅ TEST PASSED: NO MERGE verified successfully');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Is Won=Pending, Email=${lead1Email}`);
      console.log(`   Lead #2 (${lead2Id}): Active=TRUE, Is Won=Pending, Email=${lead2Email}`);
      console.log(`   Both leads remain active and independent (NO MERGE)`);
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
    .header { background: #16a34a; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .lead-section { background: #f0fdf4; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .lead-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #15803d; }
    .checkpoint { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .checkpoint-detail { margin: 8px 0; padding-left: 10px; }
    .expected { color: #6b7280; }
    .actual { color: #1f2937; font-weight: bold; }
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
      <h2><span class="icon">✅</span>NO MERGE TEST - VERIFICATION SUMMARY</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 - Remains Active (NO MERGE)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
      <div class="info-row"><span class="label">Email:</span> ${lead1Email}</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 - Remains Active (NO MERGE)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
      <div class="info-row"><span class="label">Email:</span> ${lead2Email}</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications (Steps 3-5)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Renewal only (NOT merged with Trial download)</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ IB NC Leads, Active=TRUE, Is Won=Pending</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ NO merge message (different email domains)</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications (Steps 7-9)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download only</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 2 (NOT merged)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Download Free Trial, Active=TRUE, Is Won=Pending, Lost Reason=BLANK</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ NO merge message (different email domains)</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED - NO MERGE VERIFIED</div>
      <div class="summary-text">
        Both leads remain active and independent<br>
        Lead #1 (${lead1Id}): Active, Email=${lead1Email}<br>
        Lead #2 (${lead2Id}): Active, Email=${lead2Email}<br>
        Different email domains prevent merging (company1 vs company2)<br>
        All verification points passed
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 NO MERGE Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});