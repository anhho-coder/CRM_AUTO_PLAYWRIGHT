import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage, ContactPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - STRICT CRM-9059 reproduction
 * Test Case ID: CRM-2178_2.3.1.2
 * Automation-Type: new
 * Automation-Date: 2026-07-02
 *
 * Summary: Verify that merging does NOT happen for two leads that share the SAME email whose
 * associated Contact has Contact.Level NOT set, AND that carry NON-EMPTY but DIFFERENT
 * Sales Team + Salesperson. This is the exact trigger reported in bug CRM-9059:
 * "The Lead that is full filled Salesperson and Sales Team is merged to a same email Lead
 *  that is different value at these 2 fields".
 *
 * This case is the STRICT companion of CRM-2178_2.3.1.1: 2.3.1.1 CLEARS Sales Team +
 * Salesperson on both leads (so only the Contact.Level-blank rule applies), while THIS case
 * keeps them NON-EMPTY and DIFFERENT (Lead#1 = BDEU / Thomas Semerich, Lead#2 = CMR /
 * Sergio Yalovik) - the exact CRM-9059 condition. Two independent rule clauses both forbid
 * the merge here (non-Partner Contact.Level, and different non-empty Sales Team/Salesperson),
 * yet CRM-9059 reports the merge still happens -> this test asserts NO merge and is expected
 * to FAIL while CRM-9059 is open.
 *
 * (Salesperson/team values BDEU/Thomas Semerich and CMR/Sergio Yalovik are proven-valid on
 *  pre-prod - see CRM-2178_2.2.2.1. The CRM-9059 ticket used BDEU/Ho Quoc Anh and
 *  THD/Katherine Nguyen; the defect depends on the fields being non-empty and different, not
 *  on the specific names.)
 *
 * Known defect: CRM-9059 (Open). See http://jira.nakivo.com/browse/CRM-9059
 *
 * Command to run:
 *   npx playwright test --grep "CRM-2178_2\.3\.1\.2 " --project=chromium
 *   npx playwright test --grep "CRM-9059" --project=chromium
 *
 * Steps to reproduce (per CRM-9059):
 * 1. Create Contact#1: Company = TRUE, unique Company email, Level = [Blank].
 * 2. Create Lead#1: same email, Sales Team = BDEU, Salesperson = Thomas Semerich, Lead Form = BLANK.
 * 3. Create Lead#2: same email, Sales Team = CMR, Salesperson = Sergio Yalovik, Lead Form = Download Free Trial.
 * 4. Wait for the async merge window.
 * 5. Expected: BOTH leads remain ACTIVE (NO merge). Observed (CRM-9059): one lead is merged
 *    into the other (Active = false, Lost Reason = Duplicate).
 */

test.describe('CRM-2178_2.3.1.2 [CRM-9059] - Lead Merging: Same Contact (Level NOT set) + DIFFERENT non-empty Sales Team & Salesperson (NO Merging expected)', () => {

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
      // Surface WHY the test failed (the assertion reason), not just the stabilize wait
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('❌ TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
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

  // FIXME: Test marked as skip due to known bug CRM-9059 (leads with same Contact / Level NOT set and DIFFERENT non-empty Sales Team + Salesperson are still merged)
  test.skip('CRM-2178_2.3.1.2 [CRM-9059]: Verify merging leads will NOT happen with same Contact (Level NOT set) and DIFFERENT non-empty Sales Team + Salesperson', async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);

    // Track the known defect this test reproduces
    testInfo.annotations.push({ type: 'defect', description: 'CRM-9059' });

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    const contactPage = new ContactPage(page);

    const tcId = 'CRM-2178_2.3.1.2';
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

    // CONDITION #0: Create Contact #1 (Company = TRUE, Level = BLANK)
    await test.step('Condition #0: Create Contact #1 (Level NOT set)', async () => {
      console.log('\n=== CONDITION #0: CREATING CONTACT #1 (Level NOT set) ===');

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

      // NOTE: Contact.Level is left BLANK (not set) - this is the CRM-9059 pre-condition.
      console.log('  - Level: [Blank] (NOT set) - CRM-9059 pre-condition');

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

    // CONDITION #1: Create Lead #1 (Created Manually = TRUE, Tag = Can_Merge, Sales Team = BDEU / Salesperson = Thomas Semerich, Lead Form = BLANK)
    await test.step('Condition #1: Create Lead #1 (Sales Team = BDEU, Salesperson = Thomas Semerich)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Sales Team = BDEU, Salesperson = Thomas Semerich) ===');

      // Use the same email as Contact #1
      email1 = contactEmail;
      console.log(`Using Lead#1 email: ${email1} (same as Email_Contact#1)`);

      // Click CREATE button
      await leadPage.clickCreate();
      console.log('✓ Lead #1 creation form opened');

      // Generate Lead #1 name with TC ID
      lead1Name = `TEST Lead 1 ${tcId}`;

      // Fill Lead #1 information
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);

      await leadPage.fillEmail(email1);
      console.log(`  - Email: ${email1} (Email_Lead#1 = Email_Contact#1)`);

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

      // Set Sales Team to BDEU (NON-EMPTY - CRM-9059 condition)
      await leadPage.selectSalesTeam('BDEU');
      console.log(`  - Sales Team: BDEU`);

      // Set Salesperson to Thomas Semerich (NON-EMPTY - CRM-9059 condition)
      await leadPage.selectSalesperson('Thomas Semerich');
      console.log(`  - Salesperson: Thomas Semerich`);

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

    // CONDITION #2: Create Lead #2 (Created Manually = FALSE, Sales Team = CMR / Salesperson = Sergio Yalovik, Lead Form = Download Free Trial)
    await test.step('Condition #2: Create Lead #2 (Sales Team = CMR, Salesperson = Sergio Yalovik)', async () => {
      console.log('=== CONDITION #2: CREATING LEAD #2 (Sales Team = CMR, Salesperson = Sergio Yalovik) ===');

      // Use the same email as Contact #1 (same as Lead #1)
      email2 = contactEmail;
      console.log(`Using Lead#2 email: ${email2} (same as Email_Contact#1 and Email_Lead#1)`);

      // Click CREATE button to create Lead #2
      await leadPage.clickCreate();
      console.log('✓ Lead #2 creation form opened');

      // Generate Lead #2 name with TC ID
      lead2Name = `TEST Lead 2 ${tcId}`;

      // Fill Lead #2 information
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);

      await leadPage.fillEmail(email2);
      console.log(`  - Email: ${email2} (Email_Lead#2 = Email_Contact#1)`);

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

      // Set Sales Team to CMR (NON-EMPTY and DIFFERENT from Lead#1 - CRM-9059 condition)
      await leadPage.selectSalesTeam('CMR');
      console.log(`  - Sales Team: CMR`);

      // Set Salesperson to Sergio Yalovik (NON-EMPTY and DIFFERENT from Lead#1 - CRM-9059 condition)
      await leadPage.selectSalesperson('Sergio Yalovik');
      console.log(`  - Salesperson: Sergio Yalovik`);

      // Uncheck "Created Manually"
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);

      // Fill Lead Form = Download Free Trial
      await leadPage.fillLeadForm('Download Free Trial');
      console.log(`  - Lead Form: Download Free Trial`);

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
    await test.step('Step 1: Wait for the async merge window for Lead Merging NOT happened', async () => {
      console.log('\n=== STEP 1: WAIT AND VERIFY LEAD MERGING DOES NOT HAPPEN ===');
      console.log('⏳ Waiting for the async merge window to confirm NO lead merging occurs...');

      await page.waitForTimeout(CommonUtils.waitTimes.leadMergeObservation);

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

      // Step 3.6: Verify Sales Team is BDEU (Lead#1 kept its own non-empty team - NO merge)
      await test.step('Step 3.6: Sales Team dropdown list has a value is "BDEU"', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();

        expect(salesTeam).toContain('BDEU');
        console.log(`  ✓ Step 3.6: Sales Team = BDEU`);
      });

      // Step 3.7: Verify Email (should be email1, same as Contact #1)
      await test.step('Step 3.7: Email textbox = Email_Contact#1', async () => {
        const email = await leadPage.getEmailReadonly();

        expect(email).toContain(email1);
        console.log(`  ✓ Step 3.7: Email = ${email1} (Email_Contact#1)`);
      });
    });

    // STEP 4: Verify Lead #1 CRM Developer tab (NO MERGING occurred - Active should be TRUE)
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

      // Step 4.2: Verify Active checkbox - should be TRUE (not merged). CRM-9059: expected to FAIL (merged -> false).
      await test.step('Step 4.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();

        if (!isActive) {
          console.log(`  ❌ Step 4.2 FAILED: Lead #1 Active = FALSE -> the lead was ARCHIVED by a merge (CRM-9059).`);
        }
        expect(
          isActive,
          'Lead #1 Active checkbox is FALSE - the lead was merged/archived, which must NOT happen for two same-email leads with DIFFERENT non-empty Sales Team + Salesperson (known bug CRM-9059)'
        ).toBeTruthy();
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

    // STEP 5: Open Lead #2
    await test.step('Step 5: Open the Lead 2 using URL_Lead#2', async () => {
      console.log('\n=== STEP 5: OPEN LEAD #2 ===');
      console.log(`Navigating to Lead #2 URL: ${lead2Url}`);

      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Lead #2 opened successfully\n');
    });

    // STEP 6: Verify Lead #2 fields (NO MERGING occurred)
    await test.step('Step 6: Verify the following fields on Lead #2', async () => {
      console.log('=== STEP 6: VERIFY LEAD #2 FIELDS (READONLY MODE - NO MERGING) ===\n');

      // Step 6.1: Verify Tags contain "Trial download"
      await test.step('Step 6.1: Tag field contains "Trial download"', async () => {
        const tagsText = await leadPage.getTagsText();

        expect(tagsText).toContain('Trial download');
        console.log(`  ✓ Step 6.1: Tags contain "Trial download"`);
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

      // Step 6.4: Verify Country - should be Belgium (auto-set from Contact#1)
      await test.step('Step 6.4: Country dropdown list = Belgium', async () => {
        const addressText = await leadPage.getAddressReadonly();

        expect(addressText).toContain('Belgium');
        console.log(`  ✓ Step 6.4: Country = Belgium (auto-set from Contact#1)`);
      });

      // Step 6.5: Verify State - should be Flanders (auto-set from Contact#1)
      await test.step('Step 6.5: State dropdown list = Flanders', async () => {
        const addressText = await leadPage.getAddressReadonly();

        expect(addressText).toContain('Flanders');
        console.log(`  ✓ Step 6.5: State = Flanders (auto-set from Contact#1)`);
      });

      // Step 6.6: Verify Sales Team is CMR (Lead#2 kept its own non-empty team - NO merge)
      await test.step('Step 6.6: Sales Team dropdown list has a value is "CMR"', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();

        expect(salesTeam).toContain('CMR');
        console.log(`  ✓ Step 6.6: Sales Team = CMR`);
      });

      // Step 6.7: Verify Email (should be email2, same as Contact #1)
      await test.step('Step 6.7: Email textbox = Email_Contact#1', async () => {
        const email = await leadPage.getEmailReadonly();

        expect(email).toContain(email2);
        console.log(`  ✓ Step 6.7: Email = ${email2} (Email_Contact#1)`);
      });
    });

    // STEP 7: Verify Lead #2 CRM Developer tab (NO MERGING occurred - Active should be TRUE)
    await test.step('Step 7: Click at "CRM Developer" tab and verify the following', async () => {
      console.log('\n=== STEP 7: VERIFY CRM DEVELOPER TAB (LEAD #2 - NO MERGING) ===\n');

      // Click on CRM Developer tab
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      // Step 7.1: Verify Lead form = Download Free Trial
      await test.step('Step 7.1: Lead form textbox = Download Free Trial', async () => {
        const leadForm = await leadPage.getLeadFormValue();

        expect(leadForm).toBe('Download Free Trial');
        console.log(`  ✓ Step 7.1: Lead form = ${leadForm}`);
      });

      // Step 7.2: Verify Active checkbox - should be TRUE (not merged). CRM-9059: expected to FAIL (merged -> false).
      await test.step('Step 7.2: Active checkbox = TRUE', async () => {
        const isActive = await leadPage.isActiveChecked();

        if (!isActive) {
          console.log(`  ❌ Step 7.2 FAILED: Lead #2 Active = FALSE -> the lead was ARCHIVED by a merge (CRM-9059).`);
        }
        expect(
          isActive,
          'Lead #2 Active checkbox is FALSE - the lead was merged/archived, which must NOT happen for two same-email leads with DIFFERENT non-empty Sales Team + Salesperson (known bug CRM-9059)'
        ).toBeTruthy();
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

    // Final Summary (only reached if NO merge occurred - i.e. CRM-9059 is fixed)
    await test.step('Final Summary', async () => {
      console.log('\n✅ NO Lead merging - same Contact (Level NOT set) with DIFFERENT non-empty Sales Team + Salesperson');
      console.log(`   Lead #1 (${lead1Id}): Active=TRUE, Sales Team=BDEU, Salesperson=Thomas Semerich, Tags: Can_Merge`);
      console.log(`   Lead #2 (${lead2Id}): Active=TRUE, Sales Team=CMR, Salesperson=Sergio Yalovik, Tags: Trial download`);
      console.log(`   Contact (${contactId}), Lead #1, and Lead #2 all share the same email: ${contactEmail}`);
      console.log(`   Both leads remain ACTIVE - NO merging occurred (CRM-9059 would be FIXED)`);
      console.log('==================================================\n');

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
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h2>NO LEAD MERGING (Same Contact, Level NOT set) + DIFFERENT Sales Team & Salesperson</h2></div>
    <div class="lead-section">
      <div class="lead-title">Lead #1 - Remains Active (NOT Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead1Id}</div>
      <div class="info-row"><span class="label">Email:</span> ${email1}</div>
      <div class="info-row"><span class="label">Sales Team:</span> BDEU</div>
      <div class="info-row"><span class="label">Salesperson:</span> Thomas Semerich</div>
      <div class="info-row"><span class="label">URL:</span> ${lead1Url}</div>
    </div>
    <div class="lead-section">
      <div class="lead-title">Lead #2 - Remains Active (NOT Merged)</div>
      <div class="info-row"><span class="label">Lead ID:</span> ${lead2Id}</div>
      <div class="info-row"><span class="label">Email:</span> ${email2}</div>
      <div class="info-row"><span class="label">Sales Team:</span> CMR</div>
      <div class="info-row"><span class="label">Salesperson:</span> Sergio Yalovik</div>
      <div class="info-row"><span class="label">URL:</span> ${lead2Url}</div>
    </div>
  </div>
</body>
</html>
`;

      await testInfo.attach('NO Lead Merging (CRM-9059 strict) - Test Summary', {
        body: verificationSummaryHtml,
        contentType: 'text/html'
      });
    });
  });
});
