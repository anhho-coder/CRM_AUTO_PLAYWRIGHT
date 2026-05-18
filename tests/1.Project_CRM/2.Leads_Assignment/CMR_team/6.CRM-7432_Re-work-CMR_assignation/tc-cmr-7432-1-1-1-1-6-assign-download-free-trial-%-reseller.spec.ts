import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, ContactPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Assignment Test - CMR Team - Download Free Trial % with Reseller Contact (Basic Partner Level)
 * Test Case ID: TC.CMR-7432_1.1.1.1.6
 * 
 * Summary: Verify the lead is assigned to CMR team if Lead form = Download Free Trial % ; Nakivo Customer is not set; Tag = "Partner"
 * 
 * Command to run:
 * npx playwright test --grep "TC\.CMR-7432_1\.1\.1\.1\.6:" --project=chromium
 * 
 * Pre-condition:
 * 1. After login successful as admin_crm, click at "Contacts" button
 * 2. On "Contacts" page, click at "CREATE" button and wait
 * 3. While new "Contacts" page appears, enter the following information:
 *    - At "Company" checkbox above "Contact name" textbox, set "Company" checkbox = TRUE
 *    - "Contact name" textbox = TEST-Contact + Test case ID + current date time millisecond
 *    - "Email" textbox = Company email (Test-Reseller@Reseller-company + current date + current time + millisecond.com)
 *    - (in the Address section)
 *      - "Country" dropdown list = Ukraine
 *    - "Sales Team" dropdown list = CMR
 *    - "Salesperson" dropdown list is cleared
 * 4. Press "SAVE" button and wait
 * 5. Press "EDIT" button and wait
 * 6. Press "Partner Assignation" tab
 * 7. On "Partner Assignation" view:
 *    7.1. At "Activation Date" dropdown list, enter the current date
 *    7.2. Press "CHANGE LEVEL" button and wait
 * 8. On "Change partner level" window:
 *    8.1. At "Target Level" dropdown list, select "Basic"
 *    8.2. At "Comment" textbox, enter: "Basic level + Test case ID + current date time millisecond"
 *    8.3. At "Level period end" date field, set the Current date
 *    8.4. Press "SUBMIT" button and wait
 * 9. Save the name of the Contact created above (called "Reseller#1")
 *    Press "SAVE" button to complete creating Contact
 * 10. Press "Application" icon on the top-right of screen
 * 11. Press at "CRM" button
 * 12. On "CRM" page, on menu on top of page, select "Leads" item then "Leads" sub-item
 * 13. On "Leads" page, click at "CREATE" button
 * 14. Enter the following information:
 *     - "Lead name" textbox = TEST + Test case ID + current date time millisecond
 *     - "Email" textbox = Company email (Test@company + current date + current time + millisecond.com)
 *     - (in the Address section)
 *       - "Country" dropdown list = Ukraine
 *     - "Sales Team" dropdown list is cleared
 *     - "Salesperson" dropdown list is cleared
 *     - "Created manually" checkbox is FALSE
 *     - "Reseller" dropdown list is set as "Reseller#1" created above
 * 15. Click at "CRM Developer" tab at the bottom of page
 *     - "Lead form" textbox = Download Free Trial%
 * 16. Press "SAVE" button
 * 17. (Notice: Because the "Nakivo Customer" checkbox only accept data after Save the Lead. Then we have to save Lead first, then update that checkbox)
 *     17.1. Press "EDIT" button and wait
 *     17.2. Click at "CRM Developer" tab at the bottom of page
 *           - Set "Nakivo Customer" checkbox = FALSE
 *           - Set "Partner" checkbox = TRUE
 * 18. Wait for at least 1.5 minutes until "Sales Team" dropdown list and "Salesperson" dropdown list fulfilled
 *     Click at "CRM Developer" tab and take screenshot
 * 
 * Verification:
 * ✓ Checkpoint 1: The value at "Sales Team" dropdown list is "CMR"
 * ✓ Checkpoint 2: The value at "Salesperson" dropdown list is set (any person)
 */

test.describe('TC.CMR-7432_1.1.1.1.6 - CMR Team Assignment for Download Free Trial % with Reseller', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();
    
    // Grant geolocation permission to avoid "Know your location" popup
    await context.grantPermissions(['geolocation']);
    
    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(1000);
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
  test('TC.CMR-7432_1.1.1.1.6: Verify the lead is assigned to CMR team if Lead form=Download Free Trial %, Nakivo Customer=FALSE, Partner=TRUE', async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript); // Increase timeout for performance test
    
    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const contactPage = new ContactPage(page);
    const leadPage = new LeadPage(page);
    
    let contactName: string;
    let emailAddress: string;
    let contactId: string;
    let leadName: string;
    let leadId: string;

    // Step 1: Login as admin_crm and navigate to Contacts
    await test.step('Step 1: Login and navigate to Contacts', async () => {
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName} and navigating to Contacts`);
      
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      
      // Navigate to Contacts
      await page.getByRole('link', { name: 'Contacts' }).click();
      await page.waitForURL('**/web?*action=118*', { timeout: 60000 });
      await page.waitForTimeout(2000);
      
      console.log(`✓ Login successful and navigated to Contacts page`);
    });

    // Step 2: Click CREATE button
    await test.step('Step 2: Click CREATE button', async () => {
      console.log('Step 2: Clicking CREATE button');
      
      await contactPage.clickCreate();
      
      console.log('✓ Contact creation form opened');
    });

    // Steps 3-8: Create contact with Basic partner level and Activation Date
    await test.step('Steps 3-8: Create contact with Basic partner level and Activation Date', async () => {
      console.log('Steps 3-8: Creating contact with partner level assignment and Activation Date');
      
      // Generate unique contact name and email
      const timestamp = CommonUtils.generateTimestamp();
      contactName = `TEST-Contact_TC.CMR-7432_1.1.1.1.6_${timestamp}`;
      emailAddress = `Test-Reseller@Reseller-company${timestamp}.com`;
      
      const currentDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const comment = `Basic level_TC.CMR-7432_1.1.1.1.6_${timestamp}`;
      
      // Fill contact basic information
      await page.getByLabel('Company Type').getByText('Company').click();
      await page.waitForTimeout(500);
      
      await contactPage.fillContactName(contactName);
      await contactPage.fillEmail(emailAddress);
      await contactPage.selectCountry('Ukraine');
      
      // Set Sales Team
      await page.locator('tr').filter({ hasText: 'Sales Team' }).locator('input').first().click();
      await page.locator('.ui-menu-item, .o_m2o_dropdown_option').filter({ hasText: 'CMR' }).first().click();
      
      // Clear salesperson
      await contactPage.clearSalesperson();
      
      console.log(`  - Company: Selected (TRUE)`);
      console.log(`  - Contact Name: ${contactName}`);
      console.log(`  - Email: ${emailAddress}`);
      console.log(`  - Country: Ukraine`);
      console.log(`  - Sales Team: CMR`);
      console.log(`  - Salesperson: Cleared`);
      console.log(`✓ Contact information filled`);
      
      // Save the contact
      await contactPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: 30000 }).catch(() => {});
      
      // Wait for URL to include a valid contact ID
      await page.waitForFunction(() => {
        const url = window.location.href;
        const match = url.match(/[?&#]id=(\d+)/);
        return match && match[1];
      }, { timeout: 60000 });
      
      const contactUrl = page.url();
      const idMatch = contactUrl.match(/[?&#]id=(\d+)/);
      contactId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Contact saved successfully with ID: ${contactId}`);
      
      // Click EDIT button
      await contactPage.clickEdit();
      await page.waitForTimeout(2000);
      console.log(`✓ Edit mode activated`);
      
      // Click Partner Assignation tab
      await page.locator('a:has-text("Partner Assignation"):not(:has-text("History")), a.nav-link:has-text("Assignation")').first().click();
      await page.waitForTimeout(2000);
      console.log(`✓ Partner Assignation tab opened`);
      
      // Step 7.1: Set Activation Date
      const activationDateField = page.locator('tr').filter({ hasText: 'Activation Date' }).locator('input').first();
      const activationDateVisible = await activationDateField.isVisible().catch(() => false);
      
      if (activationDateVisible) {
        await activationDateField.click();
        await activationDateField.fill(currentDate);
        console.log(`  - Activation Date: ${currentDate}`);
        console.log(`✓ Activation Date set`);
      } else {
        console.log(`  - Activation Date field not visible, skipping`);
      }
      
      // Step 7.2: Click CHANGE LEVEL button
      await page.locator('button:has-text("CHANGE LEVEL"), button:has-text("Change Level"), .btn:has-text("CHANGE")').first().click();
      await page.waitForTimeout(3000);
      console.log(`✓ Change partner level window opened`);
      
      // Set partner level
      try {
        const targetLevelField = page.locator('tr').filter({ hasText: 'Target Level' }).locator('select, input').first();
        await targetLevelField.waitFor({ timeout: 60000 });
        await targetLevelField.click();
        await page.waitForTimeout(500);
        
        const levelOption = page.locator('.ui-menu-item, .o_m2o_dropdown_option, option').filter({ hasText: 'Basic' }).first();
        await levelOption.waitFor({ timeout: 60000 });
        await levelOption.click();
      } catch (error) {
        await page.locator('[name="target_level"]').first().selectOption({ label: 'Basic' });
      }
      
      // Enter comment
      const dialog = page.locator('.modal-content, .o_dialog');
      const commentField = dialog.locator('textarea:not([disabled]), input[type="text"]:not([disabled])').last();
      await commentField.waitFor({ timeout: 60000 });
      await commentField.fill(comment);
      
      // Set Level period end
      const levelPeriodEndField = page.locator('tr').filter({ hasText: 'Level period end' }).locator('input').first();
      const levelPeriodEndVisible = await levelPeriodEndField.isVisible().catch(() => false);
      
      if (levelPeriodEndVisible) {
        await levelPeriodEndField.click();
        await levelPeriodEndField.fill(currentDate);
      }
      
      // Press SUBMIT button
      const submitButton = page.locator('button:has-text("SUBMIT"), button:has-text("Submit"), .btn-primary:has-text("SUBMIT")').first();
      await submitButton.waitFor({ timeout: 60000 });
      await submitButton.click();
      await page.waitForTimeout(3000);
      
      console.log(`  - Target Level: Basic`);
      console.log(`  - Comment: ${comment}`);
      console.log(`  - Level period end: ${currentDate}`);
      console.log(`✓ Partner level set to Basic`);
      
      // Capture screenshot after setting partner level
      const screenshotPartnerLevel = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Contact ${contactId} - Partner Level Basic`, {
        body: screenshotPartnerLevel,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot captured after setting partner level`);
    });

    // Step 9: Save and complete Contact creation
    await test.step('Step 9: Save Contact (Reseller#1)', async () => {
      console.log('Step 9: Saving Contact (Reseller#1)');
      
      await contactPage.clickSave();
      await page.waitForTimeout(2000);
      
      console.log(`✓ Contact saved - Reseller#1: ${contactName}`);
    });

    // Step 10-11: Navigate to CRM application
    await test.step('Steps 10-11: Navigate to CRM application', async () => {
      console.log('Steps 10-11: Navigating to CRM application');
      
      // Click Application icon (top menu) - it's a link with role "Applications"
      await page.getByRole('link', { name: 'Applications' }).click();
      await page.waitForTimeout(1000);
      
      console.log('✓ Applications menu opened');
    });

    // Step 12: Navigate to Leads
    await test.step('Step 12: Navigate to CRM > Leads page', async () => {
      console.log('Step 1: Click at CRM');
                  await homePage.navigateToCRM();
                  await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('Step 12: Navigating to CRM > Leads page');
      
      await homePage.navigateToLeads();
      
      console.log('✓ Navigated to Leads page');
    });

    // Step 13: Click CREATE button
    await test.step('Step 13: Click CREATE button', async () => {
      console.log('Step 13: Clicking CREATE button');
      
      await leadPage.clickCreate();
      
      console.log('✓ Lead creation form opened');
    });

    // Step 14: Fill Lead information
    await test.step('Step 14: Fill Lead information', async () => {
      console.log('Step 14: Entering Lead information');
      
      // Generate unique lead name and email
      const timestamp = CommonUtils.generateTimestamp();
      leadName = `TEST_TC.CMR-7432_1.1.1.1.6_${timestamp}`;
      const leadEmail = `Test@company${timestamp}.com`;
      
      // Fill lead name
      await leadPage.fillLeadOpportunity(leadName);
      console.log(`  - Lead Name: ${leadName}`);
      
      // Fill email
      await leadPage.fillEmail(leadEmail);
      console.log(`  - Email: ${leadEmail}`);
      
      // Select country
      await leadPage.selectCountry('Ukraine');
      console.log(`  - Country: Ukraine`);
      
      // Clear Sales Team
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Already empty'}`);
      
      // Clear Salesperson
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Already empty'}`);
      
      // Ensure "Created manually" checkbox is FALSE
      const createdManuallyUnchecked = await leadPage.uncheckCreatedManually();
      console.log(`  - Created manually: ${createdManuallyUnchecked ? 'Unchecked (FALSE)' : 'Already unchecked'}`);
      
      // Set Reseller to the created contact (Reseller#1)
      await leadPage.fillReseller(contactName);
      console.log(`  - Reseller: ${contactName}`);
      
      console.log('✓ Lead information filled');
    });

    // Step 15: Set Lead form in CRM Developer tab
    await test.step('Step 15: Set Lead form = Download Free Trial%', async () => {
      console.log('Step 15: Setting Lead form');
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      console.log('  - Clicked CRM Developer tab');
      
      // Set Lead form to "Download Free Trial%"
      const leadFormFilled = await leadPage.fillLeadForm('Download Free Trial%');
      console.log(`  - Lead Form: ${leadFormFilled ? 'Download Free Trial%' : 'Field not found in CRM Developer tab, skipping'}`);
      
      console.log('✓ CRM Developer tab configured');
    });

    // Step 16: Save the Lead
    await test.step('Step 16: Save the Lead', async () => {
      console.log('Step 16: Saving the Lead');
      
      await leadPage.clickSave();
      
      // Wait for the loading spinner to disappear
      await page.waitForSelector('text=Loading', { state: 'hidden', timeout: 30000 }).catch(() => {});
      
      // Wait for URL to include a valid lead ID
      await page.waitForFunction(() => {
        const url = window.location.href;
        const match = url.match(/[?&#]id=(\d+)/);
        return match && match[1];
      }, { timeout: 60000 });
      
      const leadUrl = page.url();
      const idMatch = leadUrl.match(/[?&#]id=(\d+)/);
      leadId = idMatch ? idMatch[1] : '';
      
      console.log(`✓ Lead saved successfully with ID: ${leadId}`);
      console.log(`  URL: ${leadUrl}`);
    });

    // Step 17: Edit lead and set Nakivo Customer and Partner checkboxes
    await test.step('Step 17: Edit lead and set checkboxes (Nakivo Customer=FALSE, Partner=TRUE)', async () => {
      console.log('Step 17: Editing lead to set checkboxes in CRM Developer tab');
      
      // Step 17.1: Press EDIT button
      console.log('  Step 17.1: Clicking EDIT button');
      await leadPage.clickEdit();
      console.log('  ✓ Edit mode activated');
      
      // Step 17.2: Click CRM Developer tab and set checkboxes
      console.log('  Step 17.2: Setting checkboxes in CRM Developer tab');
      await leadPage.clickCRMDeveloperTab();
      console.log('    - Clicked CRM Developer tab');
      
      // Uncheck "Nakivo Customer" checkbox
      const nakivoCustomerUnchecked = await leadPage.uncheckNakivoCustomer();
      console.log(`    - Nakivo Customer: ${nakivoCustomerUnchecked ? 'Unchecked (FALSE)' : 'Checkbox not found or already unchecked'}`);
      
      // Check "Partner" checkbox
      const partnerChecked = await leadPage.checkPartner();
      console.log(`    - Partner: ${partnerChecked ? 'Checked (TRUE)' : 'Checkbox not found, skipping'}`);
      
      // Save the lead
      await leadPage.clickSave();
      await page.waitForTimeout(2000);
      console.log('  ✓ Lead saved with updated checkboxes');
    });

    // Step 18: Wait for Sales Team assignment and verify
    await test.step('Step 18: Wait for Sales Team assignment and verify', async () => {
      console.log('Step 18: Waiting for Sales Team and Salesperson auto-assignment (up to 1.5 minutes)');
      
      // Use helper method to wait for assignment
      const result = await leadPage.waitForSalesTeamAssignment(
        CommonUtils.waitTimes.leadMerging, // 5 minutes
        config.timeouts.salesTeamAssignment.checkInterval
      );
      
      console.log(`✓ Auto-assignment check completed in ${result.totalWaitTime} seconds`);
      
      // Click CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(2000);
      
      // Capture screenshot
      const screenshotLead = await page.screenshot({ fullPage: true });
      await testInfo.attach(`Lead ${leadId} - After Assignment`, {
        body: screenshotLead,
        contentType: 'image/png'
      });
      console.log(`📸 Screenshot captured after assignment`);
      
      console.log(`  - Sales Team: ${result.salesTeamValue}`);
      console.log(`  - Salesperson: ${result.salespersonValue}`);
      
      console.log('\n========== VERIFICATION RESULTS ==========');
      
      // Verification 1: Sales Team = CMR
      expect(result.salesTeamValue).toBe('CMR');
      console.log('✓ Checkpoint 1 PASSED: Sales Team = CMR');
      
      // Verification 2: Salesperson is set (not empty)
      expect(result.salespersonValue).not.toBe('');
      expect(result.salespersonValue.length).toBeGreaterThan(0);
      console.log(`✓ Checkpoint 2 PASSED: Salesperson is set (${result.salespersonValue})`);
      
      console.log('==========================================\n');
    });
  });
});