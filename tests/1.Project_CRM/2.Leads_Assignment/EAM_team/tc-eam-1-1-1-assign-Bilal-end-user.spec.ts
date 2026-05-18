import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Assignment Test - EAM Team - End User assigned to Bilal Saab
 * Test Case ID: TC.EAM_1.1.1
 * 
 * Summary: Verify the lead is assigned to Bilal belong to EAM team if End User. Salesperson = Bilal
 * 
 * Command to run:
 * npx playwright test tests/Leads_Assignment/EAM_team/tc-eam-1-1-1-assign-Bilal-end-user.spec.ts --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (Test-EndUser@EndUser-company + current date + current time + millisecond.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Ukraine
 *    - "Sales Team" dropdown list = EAM
 *    - "Salesperson" dropdown list = Bilal Saab
 * 4. Save the email of the Contact created above (called "EndUser#1")
 *    Press "SAVE" button to complete creating Contact
 * 5. Press "Application" icon on the top-right of screen
 * 
 * Steps to reproduce:
 * 1. Press at "CRM" button
 * 2. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 3. On "Leads" page, click at "CREATE" button
 * 4. Enter the following information:
 *    - "Lead name" textbox = TEST + Test case ID + current date time millisecond
 *    - "Email" textbox = email of "EndUser#1" above
 *    - "Sales Team" dropdown list is cleared
 *    - "Salesperson" dropdown list is cleared
 *    - "Created manually" checkbox is FALSE
 * 5. Press "SAVE" button
 * 6. Wait for at least 1.5 minutes until "Sales Team" dropdown list and "Salesperson" dropdown list fulfilled
 * 
 * Verification (2 checkpoints):
 * ✓ Checkpoint 1: The value at "Sales Team" dropdown list is "EAM"
 * ✓ Checkpoint 2: The value at "Salesperson" dropdown list is set (any value)
 */

test.describe('TC.EAM_1.1.1 - EAM Team Assignment for End User to Bilal Saab', () => {
  
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

  test('TC.EAM_1.1.1: Verify the lead is assigned to Bilal belong to EAM team if End User. Salesperson = Bilal', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test); // 5 minutes timeout for this test (includes contact and lead creation)
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const leadPage = new LeadPage(page);
    
    let contactName: string;
    let endUserEmail: string;
    let contactId: string;
    let leadName: string;
    let leadId: string;

    // ========== PRE-CONDITION: CREATE CONTACT (END USER) ==========

    // Step 1: Login as admin_crm
    await test.step('Pre-condition Step 1: Login as admin_crm', async () => {
      console.log(`Pre-condition Step 1: Logging in as ${users.admin_crm.displayName}`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      
      // Handle location permission dialog if it appears after login
      const neverAllowButton = page.getByRole('button', { name: 'Never allow' });
      if (await neverAllowButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await neverAllowButton.click();
        await page.waitForTimeout(CommonUtils.waitTimes.medium);
      }
      
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    // Step 2: Navigate to Contacts page
    await test.step('Pre-condition Step 2: Navigate to Contacts page', async () => {
      console.log('Pre-condition Step 2: Navigating to Contacts page');
      
      await homePage.navigateToContacts();
      
      console.log('✓ Navigated to Contacts page');
    });

    // Step 3: Click CREATE button
    await test.step('Pre-condition Step 3: Click CREATE button on Contacts page', async () => {
      console.log('Pre-condition Step 3: Clicking CREATE button');
      
      await contactPage.clickCreate();
      
      console.log('✓ Contact creation form opened');
    });

    // Step 4: Fill contact information (End User #1)
    await test.step('Pre-condition Step 4: Fill contact information', async () => {
      console.log('Pre-condition Step 4: Entering contact information');
      
      // Check "Company" checkbox
      const companyChecked = await contactPage.checkCompanyCheckbox();
      console.log(`  - Company checkbox: ${companyChecked ? 'Checked (TRUE)' : 'Already checked or not found'}`);
      
      // Generate unique contact name and email
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      
      contactName = `TEST-ContactTC.EAM_1.1.1${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
      endUserEmail = `Test-EndUser@EndUser-company${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}.com`;
      
      // Fill contact name
      await contactPage.fillContactName(contactName);
      console.log(`  - Contact Name: ${contactName}`);
      
      // Fill email
      await contactPage.fillEmail(endUserEmail);
      console.log(`  - Email: ${endUserEmail}`);
      
      // Select country
      await contactPage.selectCountry('Ukraine');
      console.log(`  - Country: Ukraine`);
      
      // Set Sales Team to EAM
      await contactPage.selectSalesTeam('EAM');
      console.log(`  - Sales Team: EAM`);
      
      // Set Salesperson to Bilal Saab
      await contactPage.selectSalesperson('Bilal Saab');
      console.log(`  - Salesperson: Bilal Saab`);
      
      console.log('✓ Contact information filled');
    });

    // Step 5: Save the contact
    await test.step('Pre-condition Step 5: Save the contact', async () => {
      console.log('Pre-condition Step 5: Saving the contact');
      
      await contactPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: config.timeouts.loadingSpinner }).catch(() => {});
      
      // Wait for URL to include a valid contact ID
      await page.waitForFunction(() => {
        const url = window.location.href;
        const match = url.match(/[?&#]id=(\d+)/);
        return match && match[1];
      }, { timeout: config.timeouts.urlWait });
      
      const contactUrl = page.url();
      const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
      contactId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Contact saved successfully with ID: ${contactId}`);
      console.log(`  Contact Name (EndUser#1): ${contactName}`);
      console.log(`  Email (EndUser#1): ${endUserEmail}`);
      
      // Capture screenshot of created contact
      const screenshotContact = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Contact ${contactId} - Created End User`, {
        body: screenshotContact,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot captured of created contact`);
    });

    // Step 6: Click Application icon (go back to home)
    await test.step('Pre-condition Step 6: Click Application icon', async () => {
      console.log('Pre-condition Step 6: Clicking Application icon to go to home');
      
      // Click on application menu icon (top-right)
      await homePage.clickApplicationMenu();
      
      console.log('✓ Application menu opened');
    });

    // ========== MAIN TEST STEPS: CREATE LEAD ==========

    // Step 1: Navigate to CRM module
    await test.step('Step 1: Press at CRM button', async () => {
      console.log('\n========== MAIN TEST STEPS ==========');
      console.log('Step 1: Clicking CRM button');
      
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('✓ Navigated to CRM module');
    });

    // Step 2: Navigate to CRM > Leads page
    await test.step('Step 2: Navigate to CRM > Leads page', async () => {
     
      console.log('Step 2: Navigating to CRM > Leads page');
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 3: Click CREATE button
    await test.step('Step 3: Click CREATE button', async () => {
      console.log('Step 3: Clicking CREATE button');
      
      await leadPage.clickCreate();
      
      console.log('✓ Lead creation form opened');
    });

    // Step 4: Fill lead information
    await test.step('Step 4: Fill lead information', async () => {
      console.log('Step 4: Entering lead information');
      
      // Generate unique lead name
      leadName = CommonUtils.generateLeadName();
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email with EndUser#1 email
      await leadPage.fillEmail(endUserEmail);
      console.log(`  - Email: ${endUserEmail} (EndUser#1)`);
      
      // Clear sales team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Clear salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      // Uncheck "Created Manually"
      const unchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: ${unchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      console.log('✓ Lead information filled');
    });

    // Step 5: Save the lead
    let savedLeadUrl: string;
    await test.step('Step 5: Save the lead', async () => {
      console.log('Step 5: Saving the lead');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: config.timeouts.loadingSpinner });
      
      // Wait for URL to include a valid lead ID (not empty)
      await page.waitForFunction(() => {
        const url = window.location.href;
        const match = url.match(/[?&#]id=(\d+)/);
        return match && match[1];
      }, { timeout: config.timeouts.urlWait });
      
      // Store the URL of the saved lead for refreshing later
      savedLeadUrl = page.url();
      const idMatch = savedLeadUrl.match(/[?&#]id=(\d+)/);
      leadId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${savedLeadUrl}`);
    });

    // Step 6: Wait for Sales Team and Salesperson auto-assignment (1.5 minutes)
    await test.step('Step 6: Wait for Sales Team and Salesperson auto-assignment (up to 1.5 minutes)', async () => {
      console.log('Step 6: Waiting for Sales Team and Salesperson auto-assignment');
      console.log('  - Waiting up to 1.5 minutes for Sales Team and Salesperson to be assigned...');
      
      const startWaitTime = Date.now();
      const maxWaitTime = CommonUtils.waitTimes.eamTeamAssignment;
      const checkInterval = config.timeouts.salesTeamAssignment.checkInterval;
      let salesTeamAssigned = false;
      let salespersonAssigned = false;
      let salesTeamValue = '';
      let salespersonValue = '';
      let attemptCount = 0;
      
      while ((!salesTeamAssigned || !salespersonAssigned) && (Date.now() - startWaitTime) < maxWaitTime) {
        attemptCount++;
        
        // Refresh the page to get latest data
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        
        // Check if Sales Team and Salesperson fields are populated
        try {
          // Get Sales Team value using LeadPage method (handles both edit and readonly modes)
          if (!salesTeamAssigned) {
            salesTeamValue = await leadPage.getSalesTeamValue();
            
            if (salesTeamValue && salesTeamValue !== '' && salesTeamValue !== 'Sales Team') {
              salesTeamAssigned = true;
              const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
              console.log(`  ✓ Sales Team assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
              console.log(`  - Sales Team Value: "${salesTeamValue}"`);
            }
          }
          
          // Get Salesperson value using LeadPage method (handles both edit and readonly modes)
          if (!salespersonAssigned) {
            salespersonValue = await leadPage.getSalespersonValue();
            
            if (salespersonValue && salespersonValue !== '' && salespersonValue !== 'Salesperson') {
              salespersonAssigned = true;
              const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
              console.log(`  ✓ Salesperson assigned after ${elapsedTime} seconds (Attempt ${attemptCount})`);
              console.log(`  - Salesperson Value: "${salespersonValue}"`);
            }
          }
          
          if (!salesTeamAssigned || !salespersonAssigned) {
            const elapsedTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
            const statusSalesTeam = salesTeamAssigned ? '✓' : '⧖';
            const statusSalesperson = salespersonAssigned ? '✓' : '⧖';
            console.log(`  - Attempt ${attemptCount} (${elapsedTime}s): ${statusSalesTeam} Sales Team, ${statusSalesperson} Salesperson - waiting...`);
            await page.waitForTimeout(checkInterval);
          }
        } catch (error) {
          console.log(`  - Attempt ${attemptCount}: Error checking fields - ${error instanceof Error ? error.message : String(error)}`);
          await page.waitForTimeout(checkInterval);
        }
      }
      
      const totalWaitTime = ((Date.now() - startWaitTime) / 1000).toFixed(2);
      
      if (!salesTeamAssigned) {
        console.log(`  ⚠ Warning: Sales Team not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
        console.log(`  - Sales Team Value: "${salesTeamValue}"`);
      }
      
      if (!salespersonAssigned) {
        console.log(`  ⚠ Warning: Salesperson not assigned after ${totalWaitTime} seconds (${attemptCount} attempts)`);
        console.log(`  - Salesperson Value: "${salespersonValue}"`);
      }
      
      console.log(`✓ Auto-assignment check completed in ${totalWaitTime} seconds`);
    });

    // Verification: Confirm Sales Team is EAM and Salesperson is assigned
    await test.step('Verification: Confirm Sales Team is EAM and Salesperson is assigned', async () => {
      console.log('\n========== VERIFICATION (2 Checkpoints) ==========');
      
      // Get the current Sales Team value using LeadPage method (handles both edit and readonly modes)
      const salesTeamValue = await leadPage.getSalesTeamValue();
      
      // Get the current Salesperson value using LeadPage method (handles both edit and readonly modes)
      const salespersonValue = await leadPage.getSalespersonValue();
      
      // Capture screenshot as evidence and attach to report
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - EAM Team Assignment (End User)`, {
        body: screenshot,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot attached to test report`);
      
      console.log('\n✓ Checkpoint 1: Sales Team validation');
      console.log(`  Expected: "EAM"`);
      console.log(`  Actual:   "${salesTeamValue}"`);
      
      // Verify the Sales Team is EAM
      expect(salesTeamValue).toBe('EAM');
      console.log(`  Result:   ✓ PASSED - Sales Team is "EAM"`);
      
      console.log('\n✓ Checkpoint 2: Salesperson validation');
      console.log(`  Expected: Any person (not empty)`);
      console.log(`  Actual:   "${salespersonValue}"`);
      
      // Verify Salesperson is assigned (not empty)
      expect(salespersonValue).toBeTruthy();
      expect(salespersonValue).not.toBe('');
      expect(salespersonValue).not.toBe('Salesperson');
      console.log(`  Result:   ✓ PASSED - Salesperson is "${salespersonValue}"`);
      
      console.log('\n==================================================');
      console.log('✅ TEST PASSED: All checkpoints validated successfully');
      console.log('   Lead with End User email correctly assigned to EAM team');
      console.log('==================================================\n');
    });
  });
});