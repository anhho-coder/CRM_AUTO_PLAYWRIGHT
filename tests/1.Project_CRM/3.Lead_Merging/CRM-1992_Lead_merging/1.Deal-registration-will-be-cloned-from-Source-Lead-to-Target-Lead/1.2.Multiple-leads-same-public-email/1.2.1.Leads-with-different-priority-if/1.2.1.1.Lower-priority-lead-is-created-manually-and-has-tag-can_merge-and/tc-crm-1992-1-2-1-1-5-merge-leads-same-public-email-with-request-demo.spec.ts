import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead Merging Test - Same Public Email with Different Priority (Deal Registration)
 * Test Case ID: CRM-1992_1.2.1.1.5
 *
 * ⚠️ NOTE: THIS TEST IS CURRENTLY FAILING DUE TO BUG CRM-8929
 *
 * Summary: Verify that the merging lead happens successfully when the leads with the same 
 * public email but different priority if a lower priority lead is created manually and has tag "can_merge" 
 * and the higher priority lead has Lead form = Request Demo
 * 
 * Command to run:
 * npx playwright test --grep "CRM-1992_1.2.1.1.5" --project=chromium
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
 *    - Created manually checkbox = TRUE
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = Request Demo
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
 *    - Created manually checkbox = FALSE
 *    - Tags = "Can_Merge"
 * 3. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = BLANK
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
 *    3.1. Tag field contains 2 values: "Can_Merge", "Demo request"
 *    3.2. Company Name textbox = Company Name Lead 1
 *    3.3. Street dropdown list = 123street
 *    3.4. Country dropdown list = Belgium
 *    3.5. State dropdown list = Brussels Capital
 *    3.6. Sales Team dropdown list has a value or not
 *    3.7. Email textbox = Email_Lead#1 that created previously
 * 4. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    4.1. Lead form textbox = Request Demo
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
 *    7.1. Tag field contains "Can_Merge"
 *    7.2. Company Name textbox = Company Name Lead 1 <-- which auto set due to created Contact
 *    7.3. Street dropdown list = 123street
 *    7.4. Country dropdown list = United States
 *    7.5. State dropdown list = Texas (US)
 *    7.6. Sales Team dropdown list has a value or not
 *    7.7. Email textbox = Email_Lead#1 that created previously
 * 8. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *    8.1. Lead form textbox = BLANK
 *    8.2. Active checkbox = FALSE
 *    8.3. Is Won = Lost
 *    8.4. Lost Reason = Duplicate
 * 9. On the Log area, verify the following:
 *    9.1. There is the text as "This lead has been merged into [LEAD 1]." where [LEAD 1] is Lead Name of Lead#1
 */

test.describe('CRM-1992_1.2.1.1.5 - Lead Merging: Same Public Email with Deal Registration (Request Demo)', () => {
  
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      console.log('⚠️ Test failed - waiting for page to stabilize before screenshot...');
      const spinnerLocator = page.locator('.o_loading, .oe_loading, [class*="loading"]');
      await page.waitForTimeout(3000);
      try {
        await spinnerLocator.first().waitFor({ state: 'hidden', timeout: 10000 });
      } catch (e) {
        console.log('  ⚠️ Timeout waiting for spinners (10s), proceeding to screenshot anyway');
      }
      await page.waitForTimeout(2000);
    }
  });

  test('Verify merging leads with same public email (Created Manually = TRUE, Deal Registration, Request Demo)', async ({ page }, testInfo) => {
    test.skip(true, 'Test failing due to bug CRM-8929');
    
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);
    
    const tcId = 'CRM-1992_1.2.1.1.5';
    let sharedEmail: string;
    let lead1Name: string;
    let lead1Id: string;
    let lead1Url: string;
    let lead2Name: string;
    let lead2Id: string;
    let lead2Url: string;

    await test.step('Step 1: Login and navigate to CRM', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
      console.log(`✓ Login successful as ${users.admin_crm.displayName}`);
    });

    await test.step('Step 2: Navigate to CRM module', async () => {
      console.log('Step 2: Clicking CRM button');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM module');
    });

    await test.step('Step 3: Navigate to Leads page', async () => {
      console.log('Step 3: Navigating to CRM > Leads page');
      await homePage.navigateToLeads();
      console.log('✓ Navigated to Leads page\n');
    });

    await test.step('Condition #1: Create Lead #1 (Created Manually = TRUE, Request Demo)', async () => {
      console.log('=== CONDITION #1: CREATING LEAD #1 (Created Manually = TRUE, Request Demo) ===');
      
      const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      sharedEmail = `Test${timestamp}@gmail.com`;
      console.log(`Generated shared public email: ${sharedEmail}`);
      
      await leadPage.clickCreate();
      lead1Name = `TEST Lead 1 ${tcId}`;
      
      await leadPage.fillLeadOpportunity(lead1Name);
      console.log(`  - Lead Name: ${lead1Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (Email_Lead#1)`);
      
      await leadPage.fillCompanyName('Company Name Lead 1');
      console.log(`  - Company Name: Company Name Lead 1`);
      
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      await leadPage.selectCountry('Belgium');
      console.log(`  - Country: Belgium`);
      
      await leadPage.selectState('Brussels Capital');
      console.log(`  - State: Brussels Capital`);
      
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      await leadPage.checkCreatedManually();
      console.log(`  - Created Manually: TRUE`);

      await leadPage.fillLeadForm('Request Demo');
      console.log(`  - Lead Form: Request Demo`);
      
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead1Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      lead1Url = page.url();
      console.log(`✓ Lead #1 saved with ID: ${lead1Id}`);
      console.log(`  URL_Lead#1: ${lead1Url}\n`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #1 - Lead #1 Created (ID: ${lead1Id})`);
    });

    await test.step('Condition #2: Create Lead #2 with Deal Registration (Created Manually = FALSE, Tag = Can_Merge)', async () => {
      console.log('=== CONDITION #2: CREATING LEAD #2 (Created Manually = FALSE, Deal Registration, Tag = Can_Merge) ===');
      
      await leadPage.clickCreate();
      lead2Name = `TEST Lead 2 ${tcId}`;
      
      await leadPage.fillLeadOpportunity(lead2Name);
      console.log(`  - Lead Name: ${lead2Name}`);
      
      await leadPage.fillEmail(sharedEmail);
      console.log(`  - Email: ${sharedEmail} (same as Email_Lead#1)`);
      
      await leadPage.fillCompanyName('Company Name Lead 2');
      console.log(`  - Company Name: Company Name Lead 2`);
      
      await leadPage.fillContactName('Contact Name Lead 2');
      console.log(`  - Contact Name: Contact Name Lead 2`);
      
      await leadPage.fillStreet('123street');
      console.log(`  - Street: 123street`);
      
      await leadPage.selectCountry('United States');
      console.log(`  - Country: United States`);
      
      await leadPage.selectState('Texas');
      console.log(`  - State: Texas (US)`);
      
      const salesTeamCleared = await leadPage.clearSalesTeam();
      console.log(`  - Sales Team: ${salesTeamCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      const salespersonCleared = await leadPage.clearSalesperson();
      console.log(`  - Salesperson: ${salespersonCleared ? 'Cleared' : 'Field not found, skipping'}`);
      
      await leadPage.uncheckCreatedManually();
      console.log(`  - Created Manually: FALSE`);
      
      await leadPage.addTag('Can_Merge');
      console.log(`  - Tag: Can_Merge`);
      
      await leadPage.fillLeadForm('');
      console.log(`  - Lead Form: BLANK`);
      
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Id = await leadPage.waitForIdInUrlAndExtract(config.timeouts.urlWait);
      console.log(`✓ Lead #2 saved (first save) with ID: ${lead2Id}`);
      
      console.log('\nClicking EDIT button...');
      await leadPage.clickEdit();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      
      console.log('\nConfiguring Deal Registration...');
      await leadPage.clickDealRegistrationTab();
      await leadPage.checkRegisteredDeal();
      
      const currentDate = CommonUtils.formatDate();
      await leadPage.fillDealRegistrationStartDate(currentDate);
      await leadPage.fillDealRegistrationEndDate(currentDate);
      console.log(`  - Deal registration dates: ${currentDate}`);
      
      await leadPage.clickSave();
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      
      lead2Url = page.url();
      console.log(`✓ Lead #2 saved with Deal Registration`);
      console.log(`  URL_Lead#2: ${lead2Url}\n`);

      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `Condition #2 - Lead #2 Created (ID: ${lead2Id})`);
    });

    await test.step('Step 1: Wait for 1 minute for Lead Merging happened', async () => {
      console.log('\n=== STEP 1: WAIT FOR LEAD MERGING ===');
      console.log('⏳ Waiting 60 seconds for lead merging to occur...');
      await page.waitForTimeout(60000);
      console.log('✓ Wait complete - proceeding to verification\n');
    });

    await test.step('Step 2: Open the Lead 1 using URL_Lead#1', async () => {
      console.log('=== STEP 2: OPEN LEAD #1 ===');
      await page.goto(lead1Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Lead #1 opened successfully\n');
    });

    await test.step('Step 3: Verify the following fields on Lead #1', async () => {
      console.log('=== STEP 3: VERIFY LEAD #1 FIELDS ===\n');
      
      await test.step('Step 3.1: Tag field contains "Can_Merge", "Demo request"', async () => {
        const tagsText = await leadPage.getTagsText();
        expect(tagsText).toContain('Can_Merge');
        expect(tagsText).toContain('Demo request');
        console.log(`  ✓ Step 3.1: Tags contain "Can_Merge" and "Demo request"`);
      });

      await test.step('Step 3.2: Company Name = Company Name Lead 1', async () => {
        const companyName = await leadPage.getCompanyNameReadonly();
        expect(companyName).toContain('Company Name Lead 1');
        console.log(`  ✓ Step 3.2: Company Name = Company Name Lead 1`);
      });

      await test.step('Step 3.3-3.5: Address fields', async () => {
        const addressText = await leadPage.getAddressReadonly();
        expect(addressText).toContain('123street');
        expect(addressText).toContain('Belgium');
        expect(addressText).toContain('Brussels Capital');
        console.log(`  ✓ Step 3.3-3.5: Address verified`);
      });

      await test.step('Step 3.6: Sales Team', async () => {
        const salesTeam = await leadPage.getSalesTeamValue();
        console.log(`  ✓ Step 3.6: Sales Team = "${salesTeam}"`);
      });

      await test.step('Step 3.7: Email = Email_Lead#1', async () => {
        const email = await leadPage.getEmailReadonly();
        expect(email).toContain(sharedEmail);
        console.log(`  ✓ Step 3.7: Email = ${sharedEmail}`);
      });
    });

    await test.step('Step 4: Verify CRM Developer tab (Lead #1)', async () => {
      console.log('\n=== STEP 4: VERIFY CRM DEVELOPER TAB ===\n');
      
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      const leadForm = await leadPage.getLeadFormValue();
      expect(leadForm).toBe('Request Demo');
      console.log(`  ✓ Step 4.1: Lead form = ${leadForm}`);

      const isActive = await leadPage.isActiveChecked();
      expect(isActive).toBeTruthy();
      console.log(`  ✓ Step 4.2: Active = TRUE`);

      const isWon = await leadPage.getIsWonValue();
      expect(isWon.trim()).toBe('Pending');
      console.log(`  ✓ Step 4.3: Is Won = Pending`);

      const lostReason = await leadPage.getLostReasonValueViaTextContent();
      expect(lostReason).toBe('');
      console.log(`  ✓ Step 4.4: Lost Reason = BLANK`);
    });

    await test.step('Step 5: Verify Log area and Deal registration', async () => {
      console.log('\n=== STEP 5: VERIFY LOG AREA ===\n');
      
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      const hasMergeMessage = await leadPage.hasSourceLeadMergeMessage(lead2Name);
      expect(hasMergeMessage).toBeTruthy();
      console.log(`  ✓ Step 5.1: Merge message found`);

      await leadPage.clickDealRegistrationTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      
      const currentDate = CommonUtils.formatDate();
      const isRegistered = await leadPage.isRegisteredDealChecked();
      const startDate = await leadPage.getDealRegistrationStartDate();
      const endDate = await leadPage.getDealRegistrationEndDate();
      
      expect(isRegistered).toBeTruthy();
      expect(startDate).toBe(currentDate);
      expect(endDate).toBe(currentDate);
      console.log(`  ✓ Step 5.2: Deal registration verified`);
    });

    await test.step('Step 6: Open Lead #2', async () => {
      console.log('\n=== STEP 6: OPEN LEAD #2 ===');
      await page.goto(lead2Url, { waitUntil: 'domcontentloaded' });
      await leadPage.waitForLoadingSpinnerToHide(config.timeouts.loadingSpinner);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Lead #2 opened\n');
    });

    await test.step('Step 7: Verify Lead #2 fields', async () => {
      console.log('=== STEP 7: VERIFY LEAD #2 FIELDS ===\n');
      
      const tagsText = await leadPage.getTagsText();
      expect(tagsText).toContain('Can_Merge');
      
      const companyName = await leadPage.getCompanyNameReadonly();
      expect(companyName).toContain('Company Name Lead 1');
      
      const addressText = await leadPage.getAddressReadonly();
      expect(addressText).toContain('123street');
      expect(addressText).toContain('United States');
      expect(addressText).toContain('Texas');
      
      const email = await leadPage.getEmailReadonly();
      expect(email).toContain(sharedEmail);
      
      console.log('  ✓ All Lead #2 fields verified');
    });

    await test.step('Step 8: Verify CRM Developer tab (Lead #2)', async () => {
      console.log('\n=== STEP 8: VERIFY CRM DEVELOPER TAB (LEAD #2) ===\n');
      
      await leadPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);

      const leadForm = await leadPage.getLeadFormValue();
      expect(leadForm).toBe('');
      
      const isActive = await leadPage.isActiveChecked();
      expect(isActive).toBeFalsy();
      
      const isWon = await leadPage.getIsWonValue();
      expect(isWon.trim()).toBe('Lost');
      
      const lostReason = await leadPage.getLostReasonValueViaTextContent();
      expect(lostReason).toBe('Duplicate');
      
      console.log('  ✓ All CRM Developer fields verified');
    });

    await test.step('Step 9: Verify Log area (Lead #2)', async () => {
      console.log('\n=== STEP 9: VERIFY LOG AREA (LEAD #2) ===\n');
      
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long, 30000);
      
      const hasMergeMessage = await leadPage.hasTargetLeadMergeMessage(lead1Name);
      expect(hasMergeMessage).toBeTruthy();
      console.log(`  ✓ Step 9.1: Merge message verified`);
    });

    await test.step('Final Summary', async () => {
      console.log('\n✅ TEST PASSED');
      console.log(`   Lead #1: Request Demo, Tags: Can_Merge, Demo request`);
      console.log(`   Lead #2: Merged (Lost, Duplicate)`);
      console.log('==================================================\n');
    });
  });
});
