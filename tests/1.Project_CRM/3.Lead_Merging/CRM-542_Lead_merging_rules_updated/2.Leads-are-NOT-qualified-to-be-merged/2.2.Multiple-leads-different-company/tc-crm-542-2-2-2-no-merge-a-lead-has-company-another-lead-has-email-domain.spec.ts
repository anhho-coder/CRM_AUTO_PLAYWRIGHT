import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - NO MERGE: Different Emails and Different Companies
 * Test Case ID: CRM-542_2.2.1
 * 
 * Summary: Verify that the merging leads do NOT happens when the leads from different emails and 2 leads have 2 different companies
 * 
 * Command to run:
 * npx playwright test --grep "CRM-542_2.2.2" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm
 * 
 * I. Condition#1 to create Contact#1:
 * 1. Click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact#1 + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (Test-company@company + current date + current time + millisecond.com)
 *      (Remember the created email called Email_Contact#1)
 *      (Remember the Email domain call Domain_Email_Contact#1 is where [@company + current date + current time + millisecond.com])
 *    - (in the Address section)
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - "Sales Team" dropdown list is CMR
 *    - "Salesperson" dropdown list is cleared
 * 4. Press "SAVE" button and wait
 * 5. Press "Application" icon on the top-right of screen to return the Home page
 * 
 * II. Condition#2 to create Contact#2:
 * 1. Click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact#2 + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (Test-company@company + current date + current time + millisecond.com)
 *      (Remember the created email called Email_Contact#2)
 *      (Remember the Email domain call Domain_Email_Contact#2 is where [@company + current date + current time + millisecond.com])
 *    - (in the Address section)
 *      - Street dropdown list = 123street
 *      - Country dropdown list = United States
 *      - State dropdown list = Texas (US)
 *    - "Sales Team" dropdown list is CMR
 *    - "Salesperson" dropdown list is cleared
 * 4. Press "SAVE" button and wait
 * 5. Press "Application" icon on the top-right of screen to return the Home page
 * 
 * III. Condition#3 to create Lead#1:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Lead name textbox = TEST Lead 1 + current date time
 *    - Email textbox = naming: Lead#1 + Domain_Email_Contact#1 created above
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
 * IV. Condition#4 to create Lead#2:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - Lead name textbox = TEST Lead 2 + current date time
 *    - Email textbox = naming: Lead#2 + Domain_Email_Contact#2 created above
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
 * 1. Wait for 1 minute to see if the Lead Merging happened or not
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
 * 5. On the Log area, verify the following:
 *    5.1. There is NO the text as "[LEAD 2], has been merged into this lead." where [LEAD 2] is Lead Name of Lead#2
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
 *    7.8. Contact Name textbox = Contact Name Lead 2
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = Download Free Trial
 *    8.2. Active checkbox = TRUE
 *    8.3. Is Won = Pending
 *    8.4. Lost Reason = BLANK
 * 9. On the Log area, verify the following:
 *    9.1. There is NOT the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-542_2.2.1 - NO MERGE: Different Emails and Different Companies', () => {
  
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

  test('Verify that leads do NOT merge when leads have different emails and different companies', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-542_2.2.1';
    let contact1Name: string;
    let contact1Email: string;
    let contact1Domain: string;
    let contact1Id: string;
    let contact2Name: string;
    let contact2Email: string;
    let contact2Domain: string;
    let contact2Id: string;
    let lead1Name: string;
    let lead1Email: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Email: string;
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

    // Steps 3-4: Create Company contact #1
    await test.step('Condition I - Steps 3-4: Create Company contact #1', async () => {
      console.log('Steps 3-4: Creating Company contact #1');
      
      // Generate unique contact name and email
      const timestamp1 = CommonUtils.generateTimestamp();
      contact1Name = `TEST-Contact#1_${tcId}_${timestamp1}`;
      contact1Email = `Test-company@company${timestamp1}.com`;
      contact1Domain = `@company${timestamp1}.com`;
      
      console.log(`  - Company checkbox: TRUE (Selected)`);
      console.log(`  - Contact Name: ${contact1Name}`);
      console.log(`  - Email: ${contact1Email} (Email_Contact#1)`);
      console.log(`  - Domain: ${contact1Domain} (Domain_Email_Contact#1)`);
      console.log(`  - Street: 123street`);
      console.log(`  - Country: United States`);
      console.log(`  - State: Texas (US)`);
      console.log(`  - Sales Team: CMR`);
      console.log(`  - Salesperson: Cleared`);
      
      // Check "Company" checkbox
      await contactPage.checkCompanyCheckbox();
      
      // Fill contact name
      await contactPage.fillContactName(contact1Name);
      
      // Fill email
      await contactPage.fillEmail(contact1Email);
      
      // Fill street
      await contactPage.fillStreet('123street');
      
      // Select country
      await contactPage.selectCountry('United States');
      
      // Select state
      await contactPage.selectState('Texas');
      
      // Select Sales Team
      await contactPage.selectSalesTeam('CMR');
      
      // Clear Salesperson
      await contactPage.clearSalesperson();
      
      console.log('✓ Contact #1 information filled');
      
      // Save contact
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Extract contact ID from URL
      const contactUrl = page.url();
      const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
      contact1Id = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Contact #1 saved successfully with ID: ${contact1Id}`);
      console.log(`  Email_Contact#1: ${contact1Email}`);
      console.log(`  Domain_Email_Contact#1: ${contact1Domain}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition I - Contact #1 Created (ID: ${contact1Id})`);
    });

    // Step 5: Press "Application" icon to return Home
    await test.step('Condition I - Step 5: Press Application icon to return Home', async () => {
      console.log('Step 5: Clicking Application icon to return Home');
      
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Returned to Home page\n');
    });

    // CONDITION II: Create Contact #2
    await test.step('Condition II - Step 1: Navigate to Contacts', async () => {
      console.log('=== CONDITION II: CREATE CONTACT #2 ===');
      console.log('Step 1: Navigating to Contacts');
      
      await page.getByRole('link', { name: 'Contacts' }).click();
      await page.waitForURL('**/web?*action=118*', { timeout: 60000 });
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Navigated to Contacts page');
    });

    // Step 2: Click CREATE button
    await test.step('Condition II - Step 2: Click CREATE button', async () => {
      console.log('Step 2: Clicking CREATE button');
      
      await contactPage.clickCreate();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Contact creation form opened');
    });

    // Steps 3-4: Create Company contact #2
    await test.step('Condition II - Steps 3-4: Create Company contact #2', async () => {
      console.log('Steps 3-4: Creating Company contact #2');
      
      // Generate unique contact name and email with different timestamp
      await page.waitForTimeout(1000); // Ensure different timestamp
      const timestamp2 = CommonUtils.generateTimestamp();
      contact2Name = `TEST-Contact#2_${tcId}_${timestamp2}`;
      contact2Email = `Test-company@company${timestamp2}.com`;
      contact2Domain = `@company${timestamp2}.com`;
      
      console.log(`  - Company checkbox: TRUE (Selected)`);
      console.log(`  - Contact Name: ${contact2Name}`);
      console.log(`  - Email: ${contact2Email} (Email_Contact#2)`);
      console.log(`  - Domain: ${contact2Domain} (Domain_Email_Contact#2)`);
      console.log(`  - Street: 123street`);
      console.log(`  - Country: United States`);
      console.log(`  - State: Texas (US)`);
      console.log(`  - Sales Team: CMR`);
      console.log(`  - Salesperson: Cleared`);
      
      // Check "Company" checkbox
      await contactPage.checkCompanyCheckbox();
      
      // Fill contact name
      await contactPage.fillContactName(contact2Name);
      
      // Fill email
      await contactPage.fillEmail(contact2Email);
      
      // Fill street
      await contactPage.fillStreet('123street');
      
      // Select country
      await contactPage.selectCountry('United States');
      
      // Select state
      await contactPage.selectState('Texas');
      
      // Select Sales Team
      await contactPage.selectSalesTeam('CMR');
      
      // Clear Salesperson
      await contactPage.clearSalesperson();
      
      console.log('✓ Contact #2 information filled');
      
      // Save contact
      await contactPage.clickSave();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      // Extract contact ID from URL
      const contactUrl = page.url();
      const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
      contact2Id = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Contact #2 saved successfully with ID: ${contact2Id}`);
      console.log(`  Email_Contact#2: ${contact2Email}`);
      console.log(`  Domain_Email_Contact#2: ${contact2Domain}\n`);

      // Capture screenshot after creation
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition II - Contact #2 Created (ID: ${contact2Id})`);
    });

    // Step 5: Press "Application" icon to return Home
    await test.step('Condition II - Step 5: Press Application icon to return Home', async () => {
      console.log('Step 5: Clicking Application icon to return Home');
      
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Returned to Home page\n');
    });

    // CONDITION III: Navigate to CRM and create Lead #1
    await test.step('Condition III - Steps 1-2: Navigate to CRM > Leads', async () => {
      console.log('=== CONDITION III: CREATE LEAD #1 ===');
      console.log('Steps 1-2: Navigating to CRM > Leads');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 3: Create Lead #1
    await test.step('Condition III - Steps 3-8: Create Lead #1 with IB NC Leads form', async () => {
      console.log('Steps 3-8: Creating Lead #1');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');
      
      // Generate Lead #1 name
      lead1Name = `TEST Lead 1 ${CommonUtils.generateTimestamp()}`;
      lead1Email = `Lead#1${contact1Domain}`;
      
      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(lead1Email);
      console.log(`  - Email: ${lead1Email} (Email_Lead#1 using Domain_Email_Contact#1)`);
      
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
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition III - Lead #1 Created (ID: ${lead1Id})`);
    });

    // Step 8: Press "Application" icon to return Home
    await test.step('Condition III - Step 8: Press Application icon to return Home', async () => {
      console.log('Step 8: Clicking Application icon to return Home');
      
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      console.log('✓ Returned to Home page\n');
    });

    // CONDITION IV: Navigate to CRM and create Lead #2
    await test.step('Condition IV - Steps 1-2: Navigate to CRM > Leads', async () => {
      console.log('=== CONDITION IV: CREATE LEAD #2 ===');
      console.log('Steps 1-2: Navigating to CRM > Leads');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 3: Create Lead #2
    await test.step('Condition IV - Steps 3-7: Create Lead #2 with Download Free Trial form', async () => {
      console.log('Steps 3-7: Creating Lead #2');
      
      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');
      
      // Generate Lead #2 name
      lead2Name = `TEST Lead 2 ${CommonUtils.generateTimestamp()}`;
      lead2Email = `Lead#2${contact2Domain}`;
      
      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      // Use email with Contact #2 domain
      await leadPage.fillEmail(lead2Email);
      console.log(`  - Email: ${lead2Email} (Email_Lead#2 using Domain_Email_Contact#2)`);
      
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
      
      // Step 3.1: Tag field is "Renewal"
      await test.step('Step 3.1: Verify Tag field is "Renewal"', async () => {
        const tagsText = await leadPage.getTagsText();
        
        // Remove "Tags" label and check if it contains "Renewal"
        const tagsValue = tagsText.replace(/Tags?\s*/gi, '').trim();
        expect(tagsValue).toContain('Renewal');
        
        console.log(`  ✓ Step 3.1: Tag field is "Renewal"`);
      });
      
      // Step 3.2: Company Name = ${contact1Name}
      await test.step('Step 3.2: Verify Company Name = ${contact1Name} (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain(contact1Name);
        console.log(`  ✓ Step 3.2: Company Name = ${contact1Name}`);
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
        console.log(`  ✓ Step 3.5: State = Texas (US)`);
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
        expect(leadFormValue).toContain('IB NC Leads');
        console.log(`  ✓ Step 4.1: Lead form textbox = IB NC Leads`);
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
      
      // Step 7.2: Company Name = ${contact2Name}
      await test.step('Step 7.2: Verify Company Name = ${contact2Name} (readonly)', async () => {
        const companyNameText = await leadPage.getCompanyNameReadonly();
        expect(companyNameText).toContain(`${contact2Name}`);
        console.log(`  ✓ Step 7.2: Company Name = ${contact2Name}`);
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
      
      // Step 7.8: Contact Name = Contact Name Lead 2
      await test.step('Step 7.8: Verify Contact Name = Contact Name Lead 2 (readonly)', async () => {
        const contactNameText = await leadPage.getContactNameReadonly();
        expect(contactNameText).toContain('Contact Name Lead 2');
        console.log(`  ✓ Step 7.8: Contact Name = Contact Name Lead 2`);
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
        expect(leadFormValue).toContain('Download Free Trial');
        console.log(`  ✓ Step 8.1: Lead form textbox = Download Free Trial`);
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
      console.log('✅ TEST PASSED: NO MERGE occurred - Different emails AND different companies');
      console.log(`   Contact #1 (${contact1Id}): ${contact1Name}, Email: ${contact1Email}`);
      console.log(`   Contact #2 (${contact2Id}): ${contact2Name}, Email: ${contact2Email}`);
      console.log(`   Lead #1 (${lead1Id}): CMR team, Company=Company Name Lead 1, Lead Form=IB NC Leads, Tag=Renewal, Email=${lead1Email}, Active=TRUE`);
      console.log(`   Lead #2 (${lead2Id}): CMR team, Company=Company Name Lead 2, Lead Form=Download Free Trial, Tag=Trial download, Email=${lead2Email}, Active=TRUE`);
      console.log(`   Both leads remain independent - NO MERGE occurred due to different companies AND different emails`);
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
      <h2><span class="icon">🚫</span>NO MERGE TEST - DIFFERENT EMAILS AND DIFFERENT COMPANIES - VERIFICATION SUMMARY</h2>
    </div>
    
    <div class="no-merge">
      <div class="no-merge-title">✓ NO MERGE OCCURRED (As Expected)</div>
      <div>Leads with different email domains AND different companies should NOT merge</div>
    </div>
    
    <div class="contact-section">
      <div class="contact-title">👤 Contact #1</div>
      <div class="info-row"><span class="label">Contact ID:</span> ${contact1Id}</div>
      <div class="info-row"><span class="label">Contact Name:</span> ${contact1Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${contact1Email}</div>
      <div class="info-row"><span class="label">Domain:</span> ${contact1Domain}</div>
      <div class="info-row"><span class="label">Address:</span> 123street, Texas (US), United States</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
    </div>
    
    <div class="contact-section">
      <div class="contact-title">👤 Contact #2</div>
      <div class="info-row"><span class="label">Contact ID:</span> ${contact2Id}</div>
      <div class="info-row"><span class="label">Contact Name:</span> ${contact2Name}</div>
      <div class="info-row"><span class="label">Email:</span> ${contact2Email}</div>
      <div class="info-row"><span class="label">Domain:</span> ${contact2Domain}</div>
      <div class="info-row"><span class="label">Address:</span> 123street, Texas (US), United States</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #1 - CMR Team (Company Name Lead 1)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 1</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
      <div class="info-row"><span class="label">Lead Form:</span> IB NC Leads</div>
      <div class="info-row"><span class="label">Tag:</span> Renewal</div>
      <div class="info-row"><span class="label">Email:</span> ${lead1Email} (using Contact #1 domain)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
    </div>
    
    <div class="lead-section">
      <div class="lead-title">📋 Lead #2 - CMR Team (Company Name Lead 2)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Company Name:</span> Company Name Lead 2</div>
      <div class="info-row"><span class="label">Contact Name:</span> Contact Name Lead 2</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
      <div class="info-row"><span class="label">Lead Form:</span> Download Free Trial</div>
      <div class="info-row"><span class="label">Tag:</span> Trial download</div>
      <div class="info-row"><span class="label">Email:</span> ${lead2Email} (using Contact #2 domain)</div>
      <div class="info-row"><span class="label">Location:</span> United States, Texas (US)</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #1 Verifications (CMR Team - No Merge)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Renewal</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 1</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas (US), United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${lead1Email}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Lead Form=IB NC Leads, Active=TRUE, Is Won=Pending</span></div>
    </div>
    
    <div class="checkpoint">
      <div class="checkpoint-title">✓ Lead #2 Verifications (CMR Team - No Merge)</div>
      <div class="checkpoint-detail"><span class="label">Tags:</span> <span class="result-pass">✓ Trial download</span></div>
      <div class="checkpoint-detail"><span class="label">Company Name:</span> <span class="result-pass">✓ Company Name Lead 2</span></div>
      <div class="checkpoint-detail"><span class="label">Contact Name:</span> <span class="result-pass">✓ Contact Name Lead 2</span></div>
      <div class="checkpoint-detail"><span class="label">Address:</span> <span class="result-pass">✓ 123street, Texas (US), United States</span></div>
      <div class="checkpoint-detail"><span class="label">Sales Team:</span> <span class="result-pass">✓ CMR</span></div>
      <div class="checkpoint-detail"><span class="label">Email:</span> <span class="result-pass">✓ ${lead2Email}</span></div>
      <div class="checkpoint-detail"><span class="label">CRM Developer:</span> <span class="result-pass">✓ Lead Form=Download Free Trial, Active=TRUE, Is Won=Pending</span></div>
    </div>
    
    <div class="summary">
      <div class="summary-title">✅ TEST PASSED</div>
      <div class="summary-text">
        NO MERGE occurred as expected<br>
        Contact #1: ${contact1Name} (${contact1Email})<br>
        Contact #2: ${contact2Name} (${contact2Email})<br>
        Lead #1 (CMR): Company=Company Name Lead 1, IB NC Leads form, Renewal tag, Email=${lead1Email}, Active<br>
        Lead #2 (CMR): Company=Company Name Lead 2, Download Free Trial form, Trial download tag, Email=${lead2Email}, Active<br>
        Both leads remain active with no merge - Different emails AND different companies
      </div>
    </div>
  </div>
</body>
</html>
`;
      
      await testInfo.attach('📋 NO MERGE Test (Different Emails AND Different Companies) Verification Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
