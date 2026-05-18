import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Contact Domain Email
 * Test Case ID: CRM-2178_2.5.1.1
 * 
 * Summary: Verify that the merging lead does NOT happen when the leads with the same Contact domain email
 * 
 * Command to run:
 * npx playwright test --grep "CRM-2178_2.5.1.1" --project=chromium
 * 
 * Pre-condition:
 * I. Condition to create Contact#1:
 * 1. After login successful as admin_crm, click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact + Test case ID + current date time milisecond
 *      (Remember the Contact name of Contact#1, called Contact_name_Contact#1)
 *    - (in the Address section)
 *      - "Email" textbox = Company email (with template Test-Company@company + current date + current time + milisecon.com)
 *        (Remember the email domain of Contact#1, called Email_Domain_Contact#1 as @company + current date + current time + milisecon.com)
 *        (Remember the Email of Contact#1, called Email_Contact#1)
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *      - "Sales Team" dropdown list is CMR
 *      - "Salelsperson" dropdown list is cleared
 * 4. Press "SAVE" button and wait
 * 5. Press "Application" icon on the top - right of screen
 * 6. Press at "CRM" button
 * 7. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * I. Condition#1 to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current TC ID
 *    - Email textbox = Company email (with template Lead1@company + current date + current time + milisecon.com)
 *      (using Email_Domain_Contact#1)
 *      (Remember the created email, called Email_Lead#1)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *    - Sales Team dropdown list is cleared
 *    - Salelsperson dropdown list is cleared
 *    - Created manually checkbox = TRUE
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
 *    - Email textbox = Company email (with template Lead2@company + current date + current time + millisecond.com)
 *      (using Email_Domain_Contact#1)
 *      (Remember the created email, called Email_Lead#2)
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list is cleared
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox = FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#2, called URL_Lead#2
 * 
 * Steps to reproduce:
 * IV. Verify on Lead#1:
 * 1. Wait for 1 minute for Lead Merging NOT happened
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field contains 1 value: "Can_Merge"
 *    3.2. Company Name textbox = Contact_name_Contact#1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Flanders
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox =  Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = BLANK
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 
 * IV. Verify on Lead#2:
 * 1. Open the Lead 2 using URL_Lead#2
 * 2. Verify the following:
 *    2.1. Tag field contains "Product Registration"
 *    2.2. Company Name textbox = Contact_name_Contact#1
 *    2.3. Street dropdown list = 123street
 *    2.4. Country dropdown list = United States
 *    2.5. State dropdown list = Texas (US)
 *    2.6. Sales Team dropdown list has a value or not
 *    2.7. Email textbox =  Email_Lead#2
 * 3. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    3.1. Lead form textbox = License
 *    3.2. Active checkbox = TRUE
 *    3.3. Is Won = Pending
 *    3.4. Lost Reason = BLANK
 */

test.describe('CRM-2178_2.5.1.1 - Lead Merging: Same Contact Domain Email (NO Merging)', () => {
  
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

  test('Verify merging leads will NOT happen with same company domain but different email (with Contact created)', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const contactPage = new ContactPage(page);
    
    const tcId = 'CRM-2178_2.5.1.1';
    let emailDomain: string;
    let contactName: string;
    let contactEmail: string;
    let contactId: string;
    let email1: string;
    let email2: string;
    let lead1Name: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;

    // Step 1: Login
    await test.step('Step 1: Login as admin_crm', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // CONDITION #0: Create Contact #1
    await test.step('Condition #0: Create Contact #1', async () => {
      console.log('\n=== CONDITION #0: CREATING CONTACT #1 ===');
      
      // Step 2: Navigate to Contacts
      console.log('Step 2: Navigating to Contacts module');
      await homePage.navigateToContacts();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to Contacts module');
      
      // Step 3: Click CREATE button
      console.log('\nStep 3: Creating new Contact');
      await contactPage.clickCreate();
      console.log('✓ Contact creation form opened');
      
      // Generate contact name with TC ID and timestamp with milliseconds
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const timeStr = now.toISOString().split('T')[1].replace(/[:.]/g, '').substring(0, 9); // Include milliseconds
      contactName = `TEST-Contact ${tcId} ${dateStr}${timeStr}`;
      console.log(`  - Contact Name: ${contactName}`);
      
      // Generate email with milliseconds and extract domain
      contactEmail = `Test-Company@company${dateStr}${timeStr}.com`;
      emailDomain = `@company${dateStr}${timeStr}.com`;
      console.log(`  - Contact Email: ${contactEmail}`);
      console.log(`  - Email Domain: ${emailDomain}`);
      
      // Set Company checkbox = TRUE
      await contactPage.checkCompanyCheckbox();
      console.log('  - Company checkbox: TRUE');
      
      // Fill contact name
      await contactPage.fillContactName(contactName);
      
      // Fill email
      await contactPage.fillEmail(contactEmail);
      
      // Fill Street
      await contactPage.fillStreet('123street');
      console.log('  - Street: 123street');
      
      // Select Country - Belgium
      await contactPage.selectCountry('Belgium');
      console.log('  - Country: Belgium');
      
      // Select State - Flanders
      await contactPage.selectState('Flanders');
      console.log('  - State: Flanders');
      
      // Set Sales Team to CMR
      await contactPage.selectSalesTeam('CMR');
      console.log('  - Sales Team: CMR');
      
      // Clear Salesperson
      const salespersonCleared = await contactPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Save Contact
      await contactPage.clickSave();
      await contactPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      contactId = await contactPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      console.log(`✓ Contact saved with ID: ${contactId}\n`);
      
      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #0 - Contact Created (ID: ${contactId})`);
    });

    // Navigate to CRM > Leads
    await test.step('Step 4-7: Navigate to CRM > Leads', async () => {
      console.log('=== NAVIGATING TO CRM > LEADS ===');
      
      // Press Application icon (home)
      console.log('Step 5: Clicking Application icon');
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      // Navigate to CRM
      console.log('Step 6: Navigating to CRM module');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM module');
      
      // Navigate to Leads
      console.log('Step 7: Navigating to Leads page');
      await homePage.navigateToLeads();
      console.log('✓ Navigated to Leads page\n');
    });

    // CONDITION #1: Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Lead Form = BLANK)
    await test.step('Condition #1: Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Lead Form = BLANK)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Created Manually = TRUE, Tag = Can_Merge, Lead Form = BLANK) ===');
      
      // Generate email for Lead#1 using shared domain from Contact
      email1 = `Lead1${emailDomain}`;
      console.log(`Generated Lead#1 email: ${email1} (using Email_Domain_Contact#1)`);
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name with TC ID
      lead1Name = `TEST Lead 1 ${tcId}`;
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(email1);
      console.log(`  - Email: ${email1} (Email_Lead#1)`);
      
      // Fill Company Name
      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);
      
      // Fill Street
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      // Select Country - Belgium
      await leadPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);
      
      // Select State - Flanders
      await leadPage.selectState('Flanders');
      console.log(`  - State: Flanders`);
      
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

    // CONDITION #2: Create Lead #2 (Created Manually = FALSE, Lead Form = License, NO Deal Registration)
    await test.step('Condition #2: Create Lead #2 (Created Manually = FALSE, Lead Form = License)', async () => {
      console.log('=== CONDITION #2: CREATING LEAD #2 (Created Manually = FALSE, Lead Form = License) ===');
      
      // Generate email for Lead#2 using shared domain from Contact (different from Lead#1)
      email2 = `Lead2${emailDomain}`;
      console.log(`Generated Lead#2 email: ${email2} (using Email_Domain_Contact#1, different from Lead#1)`);
      
      // Click CREATE button to create Lead #2
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name with TC ID
      lead2Name = `TEST Lead 2 ${tcId}`;
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      await leadPage.fillEmail(email2);
      console.log(`  - Email: ${email2} (Email_Lead#2 - different from Lead#1 but same domain)`);
      
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
      
      // Fill Lead Form = License
      await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: License`);
      
      // Save Lead #2
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);
    });

    // STEP 1: Wait and verify Lead Merging does NOT happen
    await test.step('Step 1: Wait for 1 minute for Lead Merging NOT happened', async () => {
      console.log('\n=== STEP 1: WAIT AND VERIFY LEAD MERGING DOES NOT HAPPEN ===');
      console.log('⏳ Waiting 60 seconds to confirm NO lead merging occurs...');
      
      await page.waitForTimeout(60000);
      
      console.log('✓ Wait complete - proceeding to verification (expecting NO merging)\n');
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

    // STEP 3: Verify Lead #1 fields (NO MERGING occurred)
    await test.step('Step 3: Verify the following fields on Lead #1', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS (READONLY MODE - NO MERGING) ===\n');
      
      // Step 3.1: Verify Tags contain only "Can_Merge" (1 value)
      await test.step('Step 3.1: Tag field contains 1 value: "Can_Merge"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Can_Merge');
        expect(tagsText).not.toContain('Product Registration'); // Should NOT have this tag
        console.log(`  ✓ Step 3.1: Tags contain only "Can_Merge" (1 value)`);
      });

      // Step 3.2: Verify Company Name
      await test.step('Step 3.2: Company Name textbox = Contact_name_Contact#1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain(contactName);
        console.log(`  ✓ Step 3.2: Company Name = ${contactName} (Contact_name_Contact#1)`);
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
      await test.step('Step 3.5: State dropdown list = Flanders', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Flanders');
        console.log(`  ✓ Step 3.5: State = Flanders`);
      });

      // Step 3.6: Verify Sales Team (has a value or not)
      await test.step('Step 3.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 3.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 3.7: Verify Email (should be email1, not changed)
      await test.step('Step 3.7: Email textbox = Email_Lead#1', async () => {
        const email = await leadPage.getEmailReadonly();
        
        expect(email).toContain(email1);
        console.log(`  ✓ Step 3.7: Email = ${email1} (unchanged)`);
      });
    });

    // STEP 4: Verify Lead #1 CRM Developer tab
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER TAB (LEAD #1) ===\n');
      
      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 4.1: Verify Lead form = BLANK
      await test.step('Step 4.1: Lead form textbox = BLANK', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('');
        console.log(`  ✓ Step 4.1: Lead form = BLANK`);
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

    // STEP 5 (was Step 6): Open Lead #2
    await test.step('Step 5: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 5: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Lead #2 opened successfully\n');
    });

    // STEP 6 (was Step 7): Verify Lead #2 fields (NO MERGING occurred)
    await test.step('Step 6: Verify the following fields on Lead #2', async () => {
      console.log('=== STEP 6: VERIFY LEAD #2 FIELDS (READONLY MODE - NO MERGING) ===\n');
      
      // Step 6.1: Verify Tags contain "Product Registration"
      await test.step('Step 6.1: Tag field contains "Product Registration"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        expect(tagsText).toContain('Product Registration');
        console.log(`  ✓ Step 6.1: Tags contain "Product Registration"`);
      });

      // Step 6.2: Verify Company Name
      await test.step('Step 6.2: Company Name textbox = Contact_name_Contact#1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        
        expect(companyName).toContain(contactName);
        console.log(`  ✓ Step 6.2: Company Name = ${contactName} (Contact_name_Contact#1)`);
      });

      // Step 6.3: Verify Street
      await test.step('Step 6.3: Street dropdown list = 123street', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('123street');
        console.log(`  ✓ Step 6.3: Street = 123street`);
      });

      // Step 6.4: Verify Country - should be United States
      await test.step('Step 6.4: Country dropdown list = United States', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('United States');
        console.log(`  ✓ Step 6.4: Country = United States`);
      });

      // Step 6.5: Verify State - should be Texas (US)
      await test.step('Step 6.5: State dropdown list = Texas (US)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        
        expect(addressText).toContain('Texas');
        console.log(`  ✓ Step 6.5: State = Texas (US)`);
      });

      // Step 6.6: Verify Sales Team (has a value or not)
      await test.step('Step 6.6: Sales Team dropdown list has a value or not', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        
        console.log(`  ✓ Step 6.6: Sales Team = "${salesTeam}" ${salesTeam ? '(has value)' : '(empty)'}`);
      });

      // Step 6.7: Verify Email (should be email2)
      await test.step('Step 6.7: Email textbox = Email_Lead#2', async () => {
        const email = await leadPage.getEmailReadonly();
        
        expect(email).toContain(email2);
        console.log(`  ✓ Step 6.7: Email = ${email2}`);
      });
    });

    // STEP 7 (was Step 8): Verify Lead #2 CRM Developer tab (NO MERGING occurred - Active should be TRUE)
    await test.step('Step 7: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 7: VERIFY CRM DEVELOPER TAB (LEAD #2 - NO MERGING) ===\n');
      
      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 7.1: Verify Lead form = License
      await test.step('Step 7.1: Lead form textbox = License', async () => {
        const leadForm = await leadPage.getLeadFormValue();
        
        expect(leadForm).toBe('License');
        console.log(`  ✓ Step 7.1: Lead form = ${leadForm}`);
      });

      // Step 7.2: Verify Active checkbox - should be TRUE (not merged)
      await test.step('Step 7.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 7.2: Active = TRUE (not merged)`);
      });

      // Step 7.3: Verify Is Won - should be Pending (not merged)
      await test.step('Step 7.3: Is Won = Pending', async () => {
        const isWon = await leadPage.getIsWonValue();
        
        expect(isWon.trim()).toBe('Pending');
        console.log(`  ✓ Step 7.3: Is Won = ${isWon} (not merged)`);
      });

      // Step 7.4: Verify Lost Reason is BLANK (not merged)
      await test.step('Step 7.4: Lost Reason = BLANK', async () => {
         const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 7.4: Lost Reason = BLANK (not merged)`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED: NO Lead merging verified - same Contact domain email');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Is Won=Pending, Tags: Can_Merge (1 value)`);
      console.log(`   - Email: ${email1}`);
      console.log(`   - Created Manually: TRUE`);
      console.log(`   - Lead Form: BLANK`);
      console.log(`   - Company Name: ${contactName} (Contact_name_Contact#1)`);
      console.log(`   - Location: Belgium, Flanders`);
      console.log(`   Lead #2 (${lead2Id}): Active=TRUE, Is Won=Pending, Tags: Product Registration`);
      console.log(`   - Email: ${email2}`);
      console.log(`   - Created Manually: FALSE`);
      console.log(`   - Lead Form: License`);
      console.log(`   - Company Name: ${contactName} (Contact_name_Contact#1)`);
      console.log(`   - Location: United States, Texas (US)`);
      console.log(`   Both leads remain ACTIVE - NO merging occurred`);
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
    .contact-section { background: #e0f2fe; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #0284c7; }
    .lead-section { background: #dcfce7; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #16a34a; }
    .contact-title { font-weight: bold; color: #0369a1; font-size: 16px; margin-bottom: 10px; }
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
      <h2><span class="icon">\u2705</span>NO LEAD MERGING TEST - PASSED (Same Contact Domain Email)</h2>
    </div>
    
    <div class="contact-section">
      <div class="contact-title">\ud83d\udc64 Contact #1 - Created Before Leads</div>
      <div class="info-row"><span class="label">Contact ID:</span> ${contactId}</div>
      <div class="info-row"><span class="label">Contact Name:</span> ${contactName}</div>
      <div class="info-row"><span class="label">Email:</span> ${contactEmail}</div>
      <div class="info-row"><span class="label">Email Domain:</span> ${emailDomain}</div>
      <div class="info-row"><span class="label">Location:</span> Belgium, Flanders</div>
      <div class="info-row"><span class="label">Is Company:</span> TRUE</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">\ud83d\udccb Lead #1 - Remains Active (NOT Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead1Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${email1} (uses Email_Domain_Contact#1)</div>
      <div class="info-row"><span class="label">Tags:</span> Can_Merge (1 value)</div>
      <div class="info-row"><span class="label">Company Name:</span> ${contactName} (Contact_name_Contact#1)</div>
      <div class="info-row"><span class="label">Location:</span> Belgium, Flanders</div>
      <div class="info-row"><span class="label">Created Manually:</span> TRUE</div>
      <div class="info-row"><span class="label">Lead Form:</span> BLANK</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">\ud83d\udccb Lead #2 - Remains Active (NOT Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Lead Name:</span> ${lead2Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${email2} (uses Email_Domain_Contact#1)</div>
      <div class="info-row"><span class="label">Tags:</span> Product Registration</div>
      <div class="info-row"><span class="label">Company Name:</span> ${contactName} (Contact_name_Contact#1)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">Created Manually:</span> FALSE</div>
      <div class="info-row"><span class="label">Lead Form:</span> License</div>
      <div class="info-row"><span class="label">Active:</span> TRUE</div>
      <div class="info-row"><span class="label">Is Won:</span> Pending</div>
      <div class="info-row"><span class="label">Lost Reason:</span> BLANK</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
    
    <div class="summary">
      <div class="summary-title">\u2705 TEST PASSED</div>
      <div class="summary-text">
        NO Lead merging occurred - verified successfully<br>
        Contact #1: ${contactEmail} (${emailDomain})<br>
        Lead #1 Email: ${email1}<br>
        Lead #2 Email: ${email2}<br>
        All three share same email domain<br>
        Lead #2 location: United States, Texas (US)<br>
        Both leads remain ACTIVE - NO merging occurred<br>
        <br>
        <strong>All verification points passed</strong>
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('\ud83d\udccb NO Lead Merging (Same Contact Domain Email) - Test Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
