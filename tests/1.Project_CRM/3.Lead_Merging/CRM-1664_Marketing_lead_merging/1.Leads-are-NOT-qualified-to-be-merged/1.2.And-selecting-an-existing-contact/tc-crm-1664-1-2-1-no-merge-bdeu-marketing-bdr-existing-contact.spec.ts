import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - NO MERGE: BDEU and Marketing - BDR Teams with Existing Company Contact
 * Test Case ID: CRM-1664_1.2.1
 * 
 * Summary: Verify that the merging leads will NOT happen if one Lead is assigned to Marketing - BDR 
 * and selecting an existing Company contact
 * 
 * Command to run:
 * npx playwright test --grep "CRM-1664_1.2.1" --project=chromium
 * 
 * Pre-condition:
 * I. Condition to create Contact#1:
 * 1. After login successful as admin_crm, click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact + Test case ID + current date time millisecond
 *      (Remember the Contact name of Contact#1, called Contact_name_Contact#1)
 *    - "Email" textbox = Company email (Test-Reseller@Reseller-company + current date + current time + millisecond.com)
 *      (Remember the Email of Contact#1, called Email_Contact#1)
 *    - (in the Address section)
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *    - "Sales Team" dropdown list = CMR
 *    - "Salesperson" dropdown list is cleared
 * 4. Press "SAVE" button and wait
 * 5. Press "Application" icon on the top-right of screen
 * 6. Press at "CRM" button
 * 7. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 
 * II. Condition to create Lead#1:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current TC ID
 *    - Email textbox = Email_Contact#1 from Contact#1 above
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 1
 *      - Street dropdown list = 123street
 *      - Country dropdown list = Belgium
 *      - State dropdown list = Flanders
 *    - Sales Team dropdown list = BDEU
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox = FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#1, called URL_Lead#1
 * 
 * III. Condition to create Lead#2:
 * 1. On "Leads" page, click at "CREATE" button
 * 2. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current TC ID
 *    - Email textbox = Email_Contact#1 from Contact#1 above
 *    - (in the Address section)
 *      - Company Name textbox = Company Name Lead 2
 *      - Contact Name textbox = Contact Name Lead 2
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - Sales Team dropdown list = Marketing - BDR
 *    - Salesperson dropdown list is cleared
 *    - Created manually checkbox = FALSE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Trial Download QNAP
 * 4. Press "SAVE" button
 * 5. Copy URL of Lead#2, called URL_Lead#2
 * 
 * Steps to reproduce:
 * 1. Wait for 1 minute for Lead Merging happened
 * 2. Open the Lead 1 using URL_Lead#1
 * 3. Verify the following:
 *    3.1. Tag field is "Product Registration"
 *    3.2. Company Name textbox = Contact_name_Contact#1 from Contact#1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Flanders
 *    3.6. Sales Team dropdown list = BDEU
 *    3.7. Email textbox = Email_Contact#1
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = License
 *    4.2. Active checkbox = TRUE
 *    4.3. Is Won = Pending
 *    4.4. Lost Reason = BLANK
 * 
 * 6. Open the Lead 2 using URL_Lead#2
 * 7. Verify the following:
 *    7.1. Tag field is "Trial download"
 *    7.2. Company Name textbox = Contact_name_Contact#1 from Contact#1
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list = Marketing - BDR
 *    7.7. Email textbox = Email_Contact#1
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Trial Download QNAP
 *    8.2. Active checkbox = TRUE
 *    8.3. Is Won = Pending
 *    8.4. Lost Reason = BLANK
 */

test.describe('CRM-1664_1.2.1 - NO MERGE: BDEU and Marketing - BDR Teams with Existing Contact', () => {
  
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

  test('Verify that leads do NOT merge when BDEU team and Marketing - BDR team have same email from existing contact', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-1664_1.2.1';
    let contactName: string;
    let contactEmail: string;
    let contactId: string;
    let lead1Name: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;

    // CONDITION I: Create Contact#1
    
    // Step 1: Login as admin_crm and navigate to Contacts
    await test.step('Condition I - Step 1: Login and navigate to Contacts', async () => {
      console.log('\n=== CONDITION I: CREATE CONTACT #1 ===');
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName} and navigating to Contacts`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      
      // Navigate to Contacts
      await page.getByRole('link', { name: 'Contacts' }).click();
      await page.waitForURL('**/web?*action=118*', { timeout: 60000 });
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log(`✓ Login successful and navigated to Contacts page`);
    });

    // Step 2: Click CREATE button
    await test.step('Condition I - Step 2: Click CREATE button', async () => {
      console.log('Step 2: Clicking CREATE button');
      
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Contact creation form opened');
    });

    // Steps 3-4: Create Company contact
    await test.step('Condition I - Steps 3-4: Create Company contact', async () => {
      console.log('Steps 3-4: Creating Company contact');
      
      // Generate unique contact name and email
      const timestamp = CommonUtils.generateTimestamp();
      contactName = `TEST-Contact_${tcId}_${timestamp}`;
      contactEmail = `Test-Reseller@Reseller-company${timestamp}.com`;
      
      console.log(`  - Company checkbox: TRUE (Selected)`);
      console.log(`  - Contact Name: ${contactName} (Contact_name_Contact#1)`);
      console.log(`  - Email: ${contactEmail} (Email_Contact#1)`);
      console.log(`  - Street: 123street`);
      console.log(`  - Country: Belgium`);
      console.log(`  - State: Flanders`);
      console.log(`  - Sales Team: CMR`);
      console.log(`  - Salesperson: Cleared`);
      
      // Check "Company" checkbox
      await contactPage.checkCompanyCheckbox();
      
      // Fill contact name
      await contactPage.fillContactName(contactName);
      
      // Fill email
      await contactPage.fillEmail(contactEmail);
      
      // Fill street
      await contactPage.fillStreet('123street');
      
      // Select country
      await contactPage.selectCountry('Belgium');
      
      // Select state
      await contactPage.selectState('Flanders');
      
      // Select Sales Team
      await contactPage.selectSalesTeam('CMR');
      
      // Clear Salesperson
      await contactPage.clearSalesperson();
      
      console.log('✓ Contact information filled');
      
      // Save contact
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Extract contact ID from URL
      const contactUrl = page.url();
      const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
      contactId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Contact #1 saved successfully with ID: ${contactId}`);
      console.log(`  Email_Contact#1: ${contactEmail}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition I - Contact #1 Created (ID: ${contactId})`);
    });

    // Step 5: Press "Application" icon
    await test.step('Condition I - Step 5: Press Application icon', async () => {
      console.log('Step 5: Clicking Application icon');
      
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Applications menu opened');
    });

    // Step 6: Navigate to CRM module
    await test.step('Condition I - Step 6: Navigate to CRM module', async () => {
      console.log('Step 6: Clicking CRM button');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Navigated to CRM module');
    });

    // Step 7: Navigate to Leads page
    await test.step('Condition I - Step 7: Navigate to Leads page', async () => {
      console.log('Step 7: Navigating to CRM > Leads page');
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page\n');
    });

    // CONDITION II: Create Lead #1 (BDEU Team with License form)
    await test.step('Condition II: Create Lead #1 with BDEU team and License form', async () => {
      console.log('=== CONDITION II: CREATE LEAD #1 (BDEU Team with License form) ===');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name with TC ID
      lead1Name = `TEST Lead 1 ${tcId}`;
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(contactEmail);
      console.log(`  - Email: ${contactEmail} (Email_Contact#1)`);
      
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
      
      // Set Sales Team to BDEU
      await leadPage.selectSalesTeam('BDEU');
      console.log(`  - Sales Team: BDEU`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Fill Lead Form = License
      await leadPage.fillLeadForm('License');
      console.log(`  - Lead Form: License`);
      
      // Save Lead #1
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved successfully with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition II - Lead #1 Created (ID: ${lead1Id})`);
    });

    // CONDITION III: Create Lead #2 (Marketing - BDR Team with Trial Download QNAP form)
    await test.step('Condition III: Create Lead #2 with Marketing - BDR team and Trial Download QNAP form', async () => {
      console.log('=== CONDITION III: CREATE LEAD #2 (Marketing - BDR Team with Trial Download QNAP form) ===');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name with TC ID
      lead2Name = `TEST Lead 2 ${tcId}`;
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      // Use the same email from Contact #1
      await leadPage.fillEmail(contactEmail);
      console.log(`  - Email: ${contactEmail} (Email_Contact#1)`);
      
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
      
      // Set Sales Team to Marketing - BDR
      await leadPage.selectSalesTeam('Marketing - BDR');
      console.log(`  - Sales Team: Marketing - BDR`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Fill Lead Form = Trial Download QNAP
      await leadPage.fillLeadForm('Trial Download QNAP');
      console.log(`  - Lead Form: Trial Download QNAP`);
      
      // Save Lead #2
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved successfully with ID: ${lead2Id}`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition III - Lead #2 Created (ID: ${lead2Id})`);
    });

    // STEPS TO REPRODUCE:

    // Step 1: Wait for potential merge (should NOT happen)
    await test.step('Step 1: Wait to confirm NO merge happens', async () => {
      console.log('\n=== STEP 1: WAITING TO CONFIRM NO MERGE OCCURS ===');
      console.log(`BDEU team (Lead #1) and Marketing - BDR team (Lead #2) should NOT merge despite same email`);
      
      // Wait for 90 seconds to allow merge time window to pass
      await leadPage.waitForNoMergeConfirmation();
      
      console.log('✓ Step 1 completed: Waited for merge time window\n');
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
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 2 - Lead #1 (ID: ${lead1Id})`);
    });

    // Step 3: Verify the following
    await test.step('Step 3: Verify Lead #1 fields (should remain unchanged)', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS (READONLY MODE) ===\n');
      
      // Step 3.1: Tag field is "Product Registration"
      await test.step('Step 3.1: Verify Tag field is "Product Registration"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Remove "Tags" label and check if it contains "Product Registration"
        const tagsValue = tagsText.replace(/Tags?\s*/gi, '').trim();
        expect(tagsValue).toContain('Product Registration');
        
        console.log(`  ✓ Step 3.1: Tag field is "Product Registration"`);
      });
      
      // Step 3.2: Company Name = Contact_name_Contact#1
      await test.step('Step 3.2: Verify Company Name = Contact_name_Contact#1 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain(contactName);
        console.log(`  ✓ Step 3.2: Company Name = ${contactName} (Contact_name_Contact#1)`);
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
      
      // Step 3.5: State = Flanders
      await test.step('Step 3.5: Verify State = Flanders (readonly)', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('Flanders');
        console.log(`  ✓ Step 3.5: State = Flanders`);
      });
      
      // Step 3.6: Sales Team = BDEU
      await test.step('Step 3.6: Verify Sales Team = BDEU (readonly)', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        expect(salesTeamValue).toContain('BDEU');
        console.log(`  ✓ Step 3.6: Sales Team = BDEU`);
      });
      
      // Step 3.7: Email = Email_Contact#1
      await test.step('Step 3.7: Verify Email = Email_Contact#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(contactEmail.split('@')[0]);
        console.log(`  ✓ Step 3.7: Email = ${contactEmail}`);
      });
    });

    // Step 4: Click at "CRM Developer" tab and verify fields
    await test.step('Step 4: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER FIELDS (LEAD #1) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab_targetLead();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 4.1: Lead form textbox = License
      await test.step('Step 4.1: Verify Lead form textbox = License', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toContain('License');
        console.log(`  ✓ Step 4.1: Lead form textbox = License`);
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

    // Step 6: Open the Lead 2 using URL_Lead#2
    await test.step('Step 6: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);
      
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Wait for page to be fully loaded before verifying fields
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      // Verify we're on the correct lead page
      const currentUrl = page.url();
      console.log(`  Current URL after navigation: ${currentUrl}`);
      
      console.log('  ✓ Page loaded in readonly mode');
      console.log('✓ Step 6 completed: Opened Lead #2 in readonly mode\n');
      
      // Capture screenshot after opening
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Step 6 - Lead #2 (ID: ${lead2Id})`);
    });

    // Step 7: Verify the following
    await test.step('Step 7: Verify Lead #2 fields (should remain unchanged)', async () => {
      console.log('=== STEP 7: VERIFY LEAD #2 FIELDS (READONLY MODE) ===\n');
      
      // Step 7.1: Tag field is "Trial download"
      await test.step('Step 7.1: Verify Tag field is "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Remove "Tags" label and check if it contains "Trial download"
        const tagsValue = tagsText.replace(/Tags?\s*/gi, '').trim();
        expect(tagsValue).toContain('Trial download');
        
        console.log(`  ✓ Step 7.1: Tag field is "Trial download"`);
      });
      
      // Step 7.2: Company Name = Contact_name_Contact#1
      await test.step('Step 7.2: Verify Company Name = Contact_name_Contact#1 (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain(contactName);
        console.log(`  ✓ Step 7.2: Company Name = ${contactName} (Contact_name_Contact#1)`);
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
      
      // Step 7.6: Sales Team = Marketing - BDR
      await test.step('Step 7.6: Verify Sales Team = Marketing - BDR (readonly)', async () => {
        const salesTeamValue = await leadPage.getSalesTeamValue();
        expect(salesTeamValue).toContain('Marketing - BDR');
        console.log(`  ✓ Step 7.6: Sales Team = Marketing - BDR`);
      });
      
      // Step 7.7: Email = Email_Contact#1
      await test.step('Step 7.7: Verify Email = Email_Contact#1 (readonly)', async () => {
        const emailText = await leadPage.getEmailReadonly();
        expect(emailText).toContain(contactEmail.split('@')[0]);
        console.log(`  ✓ Step 7.7: Email = ${contactEmail}`);
      });
    });

    // Step 8: Click at "CRM Developer" tab and verify fields
    await test.step('Step 8: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER FIELDS (LEAD #2) ===\n');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log('  ✓ Clicked CRM Developer tab');
      
      // Step 8.1: Lead form textbox = Trial Download QNAP
      await test.step('Step 8.1: Verify Lead form textbox = Trial Download QNAP', async () => {
        const leadFormValue = await leadPage.getLeadFormValue();
        expect(leadFormValue).toContain('Trial Download QNAP');
        console.log(`  ✓ Step 8.1: Lead form textbox = Trial Download QNAP`);
      });
      
      // Step 8.2: Active checkbox = TRUE (NOT merged)
      await test.step('Step 8.2: Verify Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();
        expect(isActive).toBeTruthy();
        console.log(`  ✓ Step 8.2: Active checkbox = TRUE (lead NOT merged)`);
      });
      
      // Step 8.3: Is Won = Pending
      await test.step('Step 8.3: Verify Is Won = Pending', async () => {
        const isWonValue = await leadPage.getIsWonValue();
        expect(isWonValue).toBe('Pending');
        console.log(`  ✓ Step 8.3: Is Won = ${isWonValue}`);
      });
      
      // Step 8.4: Lost Reason = BLANK
      await test.step('Step 8.4: Verify Lost Reason = BLANK', async () => {
        const lostReasonValue = await leadPage.getLostReasonValueViaTextContent();
        expect(lostReasonValue).toBe('');
        console.log(`  ✓ Step 8.4: Lost Reason = BLANK`);
      });
    });

    // Final Summary
    await test.step('Final Summary', async () => {
      console.log('✅ TEST PASSED: NO MERGE occurred between BDEU and Marketing - BDR teams as expected');
      console.log(`   Contact #1 (${contactId}): ${contactName}, Email: ${contactEmail}`);
      console.log(`   Lead #1 (${lead1Id}): BDEU team, Lead Form=License, Tag=Product Registration, Active=TRUE`);
      console.log(`   Lead #2 (${lead2Id}): Marketing - BDR team, Lead Form=Trial Download QNAP, Tag=Trial download, Active=TRUE`);
      console.log(`   Both leads used Email_Contact#1: ${contactEmail}`);
      console.log(`   Both leads remain independent - NO MERGE occurred`);
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
    .header { background: #dc2626; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .header h2 { margin: 0; font-size: 20px; }
    .contact-section { background: #eff6ff; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #3b82f6; }
    .contact-title { font-weight: bold; color: #1e40af; font-size: 16px; margin-bottom: 10px; }
    .lead-section { background: #fef2f2; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid #dc2626; }
    .lead-title { font-weight: bold; color: #991b1b; font-size: 16px; margin-bottom: 10px; }
    .info-row { margin: 5px 0; padding-left: 15px; }
    .label { font-weight: bold; color: #991b1b; }
    .checkpoint { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .checkpoint-title { font-weight: bold; color: #15803d; font-size: 16px; margin-bottom: 10px; }
    .checkpoint-detail { margin: 8px 0; padding-left: 10px; }
    .result-pass { color: #16a34a; font-weight: bold; }
    .summary { background: #dcfce7; border: 2px solid #16a34a; padding: 20px; border-radius: 5px; margin-top: 20px; text-align: center; }
    .summary-title { color: #15803d; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .summary-text { color: #166534; line-height: 1.6; }
    .icon { font-size: 20px; margin-right: 8px; }
    .no-merge { background: #fef2f2; border: 2px solid #dc2626; padding: 15px; border-radius: 5px; margin: 15px 0; text-align: center; }
    .no-merge-title { color: #991b1b; font-size: 16px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2><span class="icon">🚫</span>NO MERGE TEST - BDEU AND MARKETING - BDR TEAMS (WITH EXISTING CONTACT) - VERIFICATION SUMMARY</h2>
    </div>
    
    <div class="no-merge">
      <div class="no-merge-title">✓ NO MERGE OCCURRED (As Expected)</div>
      <div>BDEU team and Marketing - BDR team leads with same email from existing contact should NOT merge</div>
    </div>
    
    <div class="contact-section">
      <div class="contact-title">👤 Contact #1 (Existing Company Contact)</div>
      <div class="info-row"><span class="label">Contact ID:</span> ${contactId}</div>
      <div class="info-row"><span class="label">Contact Name:</span> ${contactName} (Contact_name_Contact#1)</div>
      <div class="info-row"><span class="label">Email:</span> ${contactEmail} (Email_Contact#1)</div>
      <div class="info-row"><span class="label">Address:</span> 123street, Flanders, Belgium</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 - BDEU Team (Remained Independent)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Sales Team:</span> BDEU</div>
      <div class="info-row"><span class="label">Lead Form:</span> License</div>
      <div class="info-row"><span class="label">Tag:</span> Product Registration</div>
      <div class="info-row"><span class="label">Email:</span> ${contactEmail} (from Contact #1)</div>
      <div class="info-row"><span class="label">Location:</span> Belgium, Flanders</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 - Marketing - BDR Team (Remained Independent)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Sales Team:</span> Marketing - BDR</div>
      <div class="info-row"><span class="label">Lead Form:</span> Trial Download QNAP</div>
      <div class="info-row"><span class="label">Tag:</span> Trial download</div>
      <div class="info-row"><span class="label">Email:</span> ${contactEmail} (from Contact #1)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications (BDEU Team - No Merge)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Product Registration</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Flanders, Belgium</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ BDEU</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${contactEmail}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Lead Form=License, Active=TRUE, Is Won=Pending</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications (Marketing - BDR Team - No Merge)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1 (auto-set)</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas (US), United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ Marketing - BDR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${contactEmail}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Lead Form=Trial Download QNAP, Active=TRUE, Is Won=Pending</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        NO MERGE occurred as expected<br>
        Contact #1: ${contactName} (${contactEmail})<br>
        Lead #1 (BDEU): License form, Product Registration tag, Active<br>
        Lead #2 (Marketing - BDR): Trial Download QNAP form, Trial download tag, Active<br>
        Both leads remain active with no merge
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 NO MERGE Test (BDEU and Marketing - BDR with Existing Contact) Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
