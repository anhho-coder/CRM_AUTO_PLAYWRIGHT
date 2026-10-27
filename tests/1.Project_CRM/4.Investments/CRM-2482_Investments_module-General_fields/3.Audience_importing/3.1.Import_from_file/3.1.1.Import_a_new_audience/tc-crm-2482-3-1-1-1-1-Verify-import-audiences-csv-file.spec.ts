import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';
import {
  searchOpportunitiesByEmail,
  readOpportunity,
  logOpportunity,
  readInvestmentLeadsTab,
  deleteInvestmentByUrl,
  readImportedContacts,
  logContact,
  importedOpportunityChecks,
  importedContactsChecks,
  printVerify,
} from '@helpers/investment-import-verify.helper';

/** Labels of the verification steps - one source of truth for the test.step() label AND the stdout banner. */
const VERIFY_STEP = {
  v1: 'Verification 1: CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 1 Opportunity; open it, read the sheet and the CRM Developer tab, then the Investment > Leads tab',
  v2: 'Verification 2: Contacts, search Email_Contact#1 -> exactly 2 new contacts; "Companies" filter -> Company_Contact#1; open each contact',
} as const;

/**
 * Investments - Audience Importing Verification Test
 * Test Case ID: CRM-2482_3.1.1.1.1
 * Jira: CRM-9795 (Expected Result + "Investment ID" pre-condition added 2026-10-21, updated 2026-10-21T12:58+0300 - re-check before trusting this spec)
 *
 * Summary: Verify the new contact/ new Opp are created after importing new audience using csv file
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_3.1.1.1.1" --project=chromium
 *
 * Pre-condition:
 * 1. Login and navigate to the Investments module
 * 2. On "Investments" page, select "Investment" from the top menu
 * 3. Press "CREATE" button and wait for the form to open
 * 4. Create a blank Investment with the following fields:
 *    - Investment Name          = TEST Investment <datetime>
 *    - Investment ID            = TEST-Investment-<datetime>
 *    - Type                     = Webinar
 *    - Channel                  = Channel
 *    - Countries                = Albania
 *    - Date start               = current date
 *    - Date end                 = current date
 *    - Responsible - Sales      = Aleksey Galbur
 *    - Responsible - Marketing  = Nadiia Suprun
 *    - NBR Product List         = M365
 *    - Completion Events        = Attended webinar
 *    - Conversion Events        = Download free trial
 *    - Track conversion date start = current date
 *    - Track conversion date end   = current date + 6 months
 * 5. Create an Import Audience file:
 *    5.1. Generate test data:
 *         - Contact Name  = TEST_first_name-TEST_last_name_<timestamp>
 *         - Email         = Test@company<YYYY>-<MM>-<DD><HHMMSS>.com  (Email_Contact#1)
 *         - Company       = TEST_company_name_<timestamp>
 *         - Phone         = 1234125125
 *         - Country       = China
 *         - Sales Team    = CMR
 *         - Salesperson   = Sergey Karachin
 *         - Tags          = test
 *         - Investment ID = <Investment ID of this Investment>
 *    5.2. Read template CSV: CSV-AudienceTemplate-1.csv
 *    5.3. Fill test data into respective columns and create CSV-Audience-copy1
 *    5.4. Save the file to test-data/investment-module/CSV-Audience-copy1.csv
 *
 * Steps to reproduce:
 * 1. On Investment page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 * 4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 * 5. Select CSV-Audience-copy1 file and wait
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 *
 * Expected result (pre-production, measured 2026-10-21 with the automated spec - Opportunity #1101504, Contacts #716465/#716466; the file's "Investment ID" column was filled with the Investment ID of this Investment):
 * Name_Contact#1 = "Contact Name" of CSV-Audience-copy1; Company_Contact#1 = "Company" of CSV-Audience-copy1.
 * After Step 7, within 15 s (the import runs through the queue):
 * 1. CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 1 Opportunity:
 *    1.1. Opportunity = Name_Contact#1; Stage = New
 *    1.2. Company Name = Company_Contact#1; Contact Name = Name_Contact#1
 *    1.3. Company = Company_Contact#1; Contact = "Company_Contact#1, Name_Contact#1"
 *    1.4. Email = Email_Contact#1; Phone = 1234125125; Country = China
 *    1.5. Sales Team = CMR; Salesperson = Sergey Karachin
 *    1.6. Tags contains exactly 1 value: "test"
 *    1.7. Investment = "<Investment ID> - <Investment Name>" of this Investment (shown on the Opportunity form when the field is set; an empty Investment field is hidden - corrected 2026-10-27)
 *    1.8. CRM Developer tab: Lead form = "Investment: ID-<n>" (<n> = id in the URL of this Investment); Active = TRUE
 * 2. Contacts, search Email_Contact#1 -> exactly 2 new contacts:
 *    2.1. Company_Contact#1: Is a Company = TRUE; Email = Email_Contact#1; Phone = 1234125125; Country = China;
 *         Sales Team = CMR; Salesperson = Sergey Karachin; Tags = "test"
 *    2.2. Name_Contact#1: Related Company = Company_Contact#1; Email, Phone, Country, Sales Team, Salesperson as 2.1
 * Verification 1 and 2 below read these on screen (Email_Contact#1 is unique to the run, so the counts start
 * from 0). 1.7 is read on the Investment > Leads tab. Corrected 2026-10-27 (Jira CRM-9795/96/97 too): the
 * Opportunity form DOES show the Investment field when it is set - the earlier "not on the Opportunity form"
 * note came from a survey of records whose Investment had already been deleted (an empty field is hidden). The "Investment ID" column is filled since 2026-10-21: left EMPTY, pre-production
 * imports nothing (0 Leads, measured) - this spec passed for months without the import creating a single Lead.
 *
 * Tear down (Clean up test data):
 * 1. Delete the Investment record:
 *    1.1. Select "Action" dropdown on the page header
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" on the "Are you sure you want to delete this record?" dialog
 * 2. Delete the created CSV file (CSV-Audience-copy1.csv)
 */

test.describe('CRM-2482_3.1.1.1.1 - Verify new contact/Opp created after importing audience via CSV', () => {

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

  test('CRM-2482_3.1.1.1.1: Verify new contact/Opp created after importing new audience using csv file', async ({ page }, testInfo) => {
    // The two verification steps (CRM list + Opportunity form + Investment Leads tab + Contacts) add ~7 min to a
    // ~6-min flow; 15 min ran out in the teardown on 2026-10-21 - give the test two standard budgets.
    test.setTimeout(config.timeouts.test * 2);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDate = `${mm}/${dd}/${yyyy}`;
    const currentDateForID = `${yyyy}-${mm}-${dd}`;

    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const smYYYY = sixMonthsLater.getFullYear();
    const smMM = String(sixMonthsLater.getMonth() + 1).padStart(2, '0');
    const smDD = String(sixMonthsLater.getDate()).padStart(2, '0');
    const dateEndPlus6Months = `${smMM}/${smDD}/${smYYYY}`;

    const investmentName = `TEST Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);
    let urlInvestment = '';

    // Pre-condition Step 1: Login and navigate to Investments module
    await test.step('Pre-condition Step 1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investments module');
    });

    // Pre-condition Step 2: Navigate to Investment menu item
    await test.step('Pre-condition Step 2: Navigate to Investment', async () => {
      console.log('Step 2: Navigating to Investment menu item');

      await investmentPage.navigateToInvestment();

      console.log('✓ Navigated to Investment page\n');
    });

    // Pre-condition Step 3: Press CREATE button and wait
    await test.step('Pre-condition Step 3: Press CREATE button and wait', async () => {
      console.log('=== PRE-CONDITION STEP 3: CLICK CREATE BUTTON ===');

      await investmentPage.clickCreateButton();

      console.log('✓ Create form opened');
    });

    // Pre-condition Step 4: Create a blank Investment
    await test.step('Pre-condition Step 4: Create a blank Investment', async () => {
      console.log('=== PRE-CONDITION STEP 4: CREATE A BLANK INVESTMENT ===');

      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
        type: 'Webinar',
        channel: 'Channel',
        countries: 'Albania',
        dateStart: currentDate,
        dateEnd: currentDate,
        responsibleSales: 'Aleksey Galbur',
        responsibleMarketing: 'Nadiia Suprun',
        nbrProductList: 'M365',
        completionEvents: 'Attended webinar',
        conversionEvents: 'Download free trial',
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });

      console.log('✓ Investment record created and saved successfully');
      console.log(`✓ Investment Name: ${investmentName}`);
      console.log(`✓ Investment ID  : ${investmentID}`);
    });

    console.log('\n✅ PRE-CONDITIONS COMPLETED SUCCESSFULLY');

    // ---- Step 5: Create an Import Audience file ----
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Step 5: Create an Import Audience file (CSV-Audience-copy1.csv)', async () => {
      console.log('=== STEP 5: CREATE IMPORT AUDIENCE FILE ===');

      audienceData = await investmentPage.createImportAudienceFile({ investmentId: investmentID });

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);

      console.log('  ✓ File content verified — Contact Name, Email, and Company Name present');
      console.log(`  ✓ Email_Contact#1 : ${audienceData.emailContact1}`);
    });

    console.log('\n✅ STEP 5 COMPLETED SUCCESSFULLY');

    // ---- Steps to reproduce ----

    // Step 1: Press EDIT button
    await test.step('Step 1: On Investment page, press "EDIT" button and wait', async () => {
      console.log('=== STEP 1: CLICK EDIT BUTTON ===');

      await investmentPage.clickEditButton();

      console.log('✓ Edit mode activated');
    });

    // Step 2: Click the "Audience" tab
    await test.step('Step 2: Click at "Audience" tab', async () => {
      console.log('=== STEP 2: CLICK AUDIENCE TAB ===');

      await investmentPage.clickAudienceTab();

      console.log('✓ Audience tab clicked');
    });

    // Step 3–5: Click "UPLOAD YOUR FILE" button and upload the CSV
    await test.step('Step 3–5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy1', async () => {
      console.log('=== STEP 3-5: UPLOAD CSV FILE ===');

      await investmentPage.uploadAudienceCSV(audienceData.outputPath);

      console.log(`✓ CSV file uploaded: ${audienceData.outputPath}`);
    });

    // Step 6: Click "IMPORT" button and wait
    await test.step('Step 6: Press "IMPORT" button and wait', async () => {
      console.log('=== STEP 6: CLICK IMPORT BUTTON ===');

      await investmentPage.clickImportButton();

      console.log('✓ Import completed');
    });

    // Step 7: Save the Investment record
    await test.step('Step 7: Press "SAVE" button on Investment page', async () => {
      console.log('=== STEP 7: CLICK SAVE BUTTON ===');

      await investmentPage.clickSaveButton();

      console.log('✓ Investment record saved');
      urlInvestment = page.url();
      console.log(`  URL of this Investment : ${urlInvestment}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Investment saved after IMPORT');
    });

    await test.step(VERIFY_STEP.v1, async () => {
      console.log(`\n--- ${VERIFY_STEP.v1} ---`);
      const investmentDbId = Number((urlInvestment.match(/[#&?]id=(\d+)/) || [])[1] || 0);
      // The import commits through the queue a few seconds after SAVE - poll the list up to ~30 s.
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      let rows = await searchOpportunitiesByEmail(page, audienceData.emailContact1);
      for (let attempt = 1; rows === 0 && attempt <= 3; attempt++) {
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        await homePage.clickApplicationMenu();
        await homePage.navigateToCRM();
        rows = await searchOpportunitiesByEmail(page, audienceData.emailContact1);
      }
      const opp = await readOpportunity(page, { email: audienceData.emailContact1, readInvestmentOnForm: false });
      logOpportunity('Opportunity read on screen:', opp);
      const leadsTab = await readInvestmentLeadsTab(page, urlInvestment);
      console.log(`  Investment > Leads tab : Opportunity = ${leadsTab.opportunity} | Email = ${leadsTab.email}`);
      const checks = importedOpportunityChecks(rows, opp, {
        contactName: audienceData.contactName,
        companyName: audienceData.companyName,
        email: audienceData.emailContact1,
        investmentDbId,
      });
      checks.push(
        { label: '1.7 Investment > Leads tab - Opportunity', expected: audienceData.contactName, actual: leadsTab.opportunity },
        { label: '1.7 Investment > Leads tab - Email', expected: audienceData.emailContact1, actual: leadsTab.email },
      );
      const { allPass, lines } = printVerify(checks, 'the import created exactly 1 Opportunity carrying the file data and this Investment');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `CRM-2482_3.1.1.1.1 - Opportunity`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(VERIFY_STEP.v2, async () => {
      console.log(`\n--- ${VERIFY_STEP.v2} ---`);
      const r = await readImportedContacts(page, audienceData.emailContact1, audienceData.contactName);
      console.log(`  Contacts rows for Email_Contact#1 : ${JSON.stringify(r.rowNames)}`);
      console.log(`  Rows left by "Companies"         : ${JSON.stringify(r.companyRowNames)}`);
      logContact('Company_Contact#1 read on screen:', r.company);
      logContact('Name_Contact#1 read on screen:', r.person);
      const checks = importedContactsChecks(r, { contactName: audienceData.contactName, companyName: audienceData.companyName, email: audienceData.emailContact1 });
      const { allPass, lines } = printVerify(checks, 'the import created exactly 2 Contacts: the company and the individual under it');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `CRM-2482_3.1.1.1.1 - Contacts`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    console.log('\n✅ STEPS TO REPRODUCE COMPLETED SUCCESSFULLY');

    // Tear down: Delete the Investment record
    await test.step('Tear down Step 1: Delete Investment record', async () => {
      console.log('\n=== TEAR DOWN ===');
      console.log('Tear down Step 1: Deleting Investment record');

      // Back on THIS run's Investment first - Verification 2 leaves the page on a Contact form: full reload at its
      // URL (id checked), then delete the record on screen, the source's own mechanism - retried while the Action
      // menu does not offer "Delete" yet (right after an XLSX import it did not, 2026-10-21).
      await deleteInvestmentByUrl(page, urlInvestment);

      console.log('✓ Investment record deleted successfully');
      console.log(`✓ Deleted: ${investmentName}`);
    });

    // Tear down Step 2: Delete CSV file
    await test.step('Tear down Step 2: Delete CSV file CSV-Audience-copy1.csv', async () => {
      console.log('Tear down Step 2: Deleting CSV file');

      if (fs.existsSync(audienceData.outputPath)) {
        fs.unlinkSync(audienceData.outputPath);
        expect(fs.existsSync(audienceData.outputPath), `CSV file was not deleted: ${audienceData.outputPath}`).toBeFalsy();
        console.log(`✓ CSV file deleted: ${audienceData.outputPath}`);
      } else {
        console.log(`  ℹ️ CSV file not found (already deleted or never created): ${audienceData.outputPath}`);
      }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
