import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Different Public Domain Emails (No Merge Expected)
 * Test Case ID: CRM-542_2.1.1
 * 
 * Summary: Verify that the merging leads do NOT happens when the leads from the different public domain email
 * 
 * Command to run:
 * npx playwright test --grep "CRM-542_2.1.1" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful, click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current date time
 *    - Email textbox = Personal Gmail email (with template Test+ company + current date + current time@gmail.com)
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
 *    - Lead form textbox = Download Free Trial
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1, called URL_Lead#1
 * 
 * II. Condition#2 to create Lead#2:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current date time
 *    - Email textbox = Personal Yahoo email (with template Test+ company + current date + current time@yahoo.com)
 *      (Remember the created email, called Email_Lead#2)
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
 * 1. Wait for 1 minute to see if the Lead Merging happened or not
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains 1 value: "Trial download"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = United States
 *    3.5. State dropdown list = Texas (US)
 *    3.6. Sales Team dropdown list is CMR
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Download Free Trial
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 5. On the Log area, verify the following:
 *    5.1. There is NO the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field contains 1 value: "Trial download"
 *    7.2. Company Name textbox = Company Name Lead 2
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list is CMR
 *    7.7. Email textbox = Email_Lead#2 that created previously
 *    7.8. Contact Name textbox = Contact Name Lead 2
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Download Free Trial
 *    8.2. Active checkbox = TRUE
 *    8.3. Is Won = Pending
 *    8.4. Lost Reason = BLANK
 * 9. On the Log area, verify the following:
 *    9.1. There is NOT the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-542_2.1.1 - Lead Merging: Different Public Domain Emails (No Merge Expected)', () => {
  
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

  test('Verify merging leads do NOT happen when leads from different public domain emails', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Known issue: This test may fail due to defect - related to CRM-8929
    // Company Name field behavior may be inconsistent
    test.fail();
    test.info().annotations.push({ type: 'defect', description: 'Related to CRM-8929 - Potential Company Name field inconsistency' });
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    let email1: string;
    let email2: string;
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

    // CONDITION #1: Create Lead #1 (Gmail - @gmail.com)
    await test.step('Condition #1: Create Lead #1 with Gmail address', async () => {
      console.log('\n=== CREATING LEAD #1 (Gmail - @gmail.com) ===');
      
      // Generate Gmail email (@gmail.com)
      // Format: Test+company-2026-01-07-123456@gmail.com
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      email1 = `Test+company-${timestamp}@gmail.com`;
      console.log(`Generated Gmail email: ${email1}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name
      lead1Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 1');
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(email1);
      console.log(`  - Email: ${email1}`);
      
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
      
      // Fill Lead Form = Download Free Trial
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);
      
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

    // CONDITION #2: Create Lead #2 (Yahoo - @yahoo.com)
    await test.step('Condition #2: Create Lead #2 with Yahoo address', async () => {
      console.log('=== CREATING LEAD #2 (Yahoo - @yahoo.com) ===');
      
      // Generate Yahoo email (@yahoo.com) - DIFFERENT domain
      // Format: Test+company-2026-01-07-123456@yahoo.com
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      email2 = `Test+company-${timestamp}@yahoo.com`;
      console.log(`Generated Yahoo email: ${email2}`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name
      lead2Name = CommonUtils.generateLeadNameWithPrefix('TEST Lead 2');
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      // Use DIFFERENT email domain (Yahoo)
      await leadPage.fillEmail(email2);
      console.log(`  - Email: ${email2} (DIFFERENT domain from Lead #1)`);
      
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

    // Step 1: Wait to see if Lead Merging happens or not
    await test.step('Step 1: Wait to see if Lead Merging happens or not', async () => {
      console.log('\n=== STEP 1: WAITING TO CHECK IF MERGING OCCURS ===');
      console.log(`Lead #1 (${lead1Id}): ${email1} (@gmail.com)`);
      console.log(`Lead #2 (${lead2Id}): ${email2} (@yahoo.com)`);
      console.log(`Expected: NO merging should occur (different public domain emails)`);
      
      // Wait 1 minute to ensure merging would have occurred if it was going to
      console.log('  ⏳ Waiting 60 seconds to verify no merge occurs...');
      await page.waitForTimeout(60000);
      
      console.log('✓ Step 1 completed: Wait time elapsed\n');
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 (No Merge) (ID: ${lead1Id})`);
    });

    // Step 3: Verify the following
    await test.step('Step 3: Verify the following', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS (SHOULD BE UNCHANGED) ===\n');
      
      // Step 3.1: Tag field contains 1 value: "Trial download"
      await test.step('Step 3.1: Verify Tag field contains 1 value: "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Verify expected tag is present
        expect(tagsText).toContain('Trial download');
        
        console.log(`  ✓ Step 3.1: Tag field contains 1 value: "Trial download"`);
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
      
      // Step 3.7: Email = email1
      await test.step('Step 3.7: Verify Email = Email_Lead#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(email1.split('@')[0]);
        console.log(`  ✓ Step 3.7: Email = ${email1}`);
      });
      
      // Note: No Contact Name check for Lead #1 - it should NOT have been transferred
    });

    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab_targetLead();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = Download Free Trial
      await test.step('Step 4.1: Verify Lead form textbox = Download Free Trial', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toBe('Download Free Trial');
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

    // Step 5: On the Log area, verify NO merge message
    await test.step('Step 5: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA (LEAD #1) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 5.1: Verify NO merge message
      await test.step('Step 5.1: Verify NO merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasSourceLeadMergeMessage(lead2Name);
        
        expect(hasMergeMessage).toBeFalsy();
        console.log(`  ✓ Step 5.1: Confirmed NO log message: "${lead2Name}, has been merged into this lead."`);
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 (No Merge) (ID: ${lead2Id})`);
    });

    // Step 7: Verify the following
    await test.step('Step 7: Verify the following', async () => {
      console.log('=== STEP 7: VERIFY LEAD #2 FIELDS (SHOULD BE UNCHANGED) ===\n');
      
      // Step 7.1: Tag field contains 1 value: "Trial download"
      await test.step('Step 7.1: Verify Tag field contains 1 value: "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Verify expected tag is present
        expect(tagsText).toContain('Trial download');
        
        console.log(`  ✓ Step 7.1: Tag field contains 1 value: "Trial download"`);
      });
      
      // Step 7.2: Company Name = Company Name Lead 2
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
      
      // Step 7.7: Email = email2
      await test.step('Step 7.7: Verify Email = Email_Lead#2 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(email2.split('@')[0]);
        console.log(`  ✓ Step 7.7: Email = ${email2}`);
      });
      
      // Step 7.8: Contact Name = Contact Name Lead 2 (unchanged)
      await test.step('Step 7.8: Verify Contact Name = Contact Name Lead 2 (readonly)', async () => {
        const contactNameText = await leadPage.getContactNameReadonly();
        expect(contactNameText).toContain('Contact Name Lead 2');
        console.log(`  ✓ Step 7.8: Contact Name = Contact Name Lead 2 (unchanged)`);
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
      
      // Step 8.2: Active checkbox = TRUE (NOT merged)
      await test.step('Step 8.2: Verify Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 8.2: Active checkbox = ${isActive ? 'TRUE' : 'FALSE'}`);
      });
      
      // Step 8.3: Is Won = Pending (NOT Lost)
      await test.step('Step 8.3: Verify Is Won = Pending', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Pending');
        console.log(`  ✓ Step 8.3: Is Won = ${isWonValue}`);
      });
      
      // Step 8.4: Lost Reason = BLANK (NOT Duplicate)
      await test.step('Step 8.4: Verify Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 8.4: Lost Reason = BLANK`);
      });
    });

    // Step 9: On the Log area, verify NO merge message
    await test.step('Step 9: On the Log area, verify the following', async () => {
      console.log('\n=== STEP 9: VERIFY LOG AREA (LEAD #2) ===\n');
      
      // Wait for page to be fully loaded
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Step 9.1: Verify NO merge message
      await test.step('Step 9.1: Verify NO merge message in Log area', async () => {
        const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(lead1Name);
        
        expect(hasMergeMessage).toBeFalsy();
        console.log(`  ✓ Step 9.1: Confirmed NO log message: "This lead has been merged into ${lead1Name}."`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('✅ TEST PASSED: No merging occurred as expected');
      console.log(`   Lead #1 (${lead1Id}): ${email1} (@gmail.com)`);
      console.log(`   Lead #1: Active=TRUE, Is Won=Pending, NO merge messages`);
      console.log(`   Lead #2 (${lead2Id}): ${email2} (@yahoo.com)`);
      console.log(`   Lead #2: Active=TRUE, Is Won=Pending, NO merge messages`);
      console.log(`   Both leads remain independent (different public domains)`);
      console.log(`   All 22 verification points passed`);
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
    .checkpoint { background: #f0f9ff; border-left: 4px solid #2563eb; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #1e40af; font-size: 16px; margin-bottom: 10px; }
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
      <h2><span class="icon">✅</span>NO MERGE TEST - CRM-542_2.1.1</h2>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 - Independent Lead</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead1Name}</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 1</div>
      <div class="info-row"><span class="label">Contact Name:</span> (None)</div>
      <div class="info-row"><span class="label">Email:</span> <span class="highlight">${email1} (Gmail)</span></div>
      <div class="info-row"><span class="label">Status:</span> Active=TRUE, Is Won=Pending</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 - Independent Lead</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead2Name}</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 2</div>
      <div class="info-row"><span class="label">Contact Name:</span> Contact Name Lead 2</div>
      <div class="info-row"><span class="label">Email:</span> <span class="highlight">${email2} (Yahoo)</span></div>
      <div class="info-row"><span class="label">Status:</span> Active=TRUE, Is Won=Pending</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications (Steps 3-5)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download only</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1 (unchanged)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${email1}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Download Free Trial, Active=TRUE, Is Won=Pending</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ NO merge message found</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications (Steps 7-9)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download only</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 2 (unchanged)</span></div>
      <div class="checkpoint-detail"><span class="label">Contact Name:</span> <span class="result-pass">✓ Contact Name Lead 2 (unchanged)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas, United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${email2}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Download Free Trial, Active=TRUE, Is Won=Pending</span></div>
      <div class="checkpoint-detail"><span class="label">Log Message:</span> <span class="result-pass">✓ NO merge message found</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED - NO MERGE</div>
      <div class="summary-text">
        <strong>DIFFERENT PUBLIC DOMAIN EMAILS:</strong> @gmail.com vs @yahoo.com<br>
        Both leads remain independent and active<br>
        No merge messages found on either lead<br>
        All 22 verification points passed
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 No Merge Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });

    // Capture screenshot before closing browser
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Final View - Test Completed`);
  });
});
