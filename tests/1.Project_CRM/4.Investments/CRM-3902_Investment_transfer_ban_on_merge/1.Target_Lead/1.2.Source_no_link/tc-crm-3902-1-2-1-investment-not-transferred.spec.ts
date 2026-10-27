import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, InvestmentPage, OpportunityPage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import * as fs from 'fs';
import * as path from 'path';
import {
  searchOpportunitiesByEmail,
  readMergeOutcome,
  logMergeOutcome,
  readInvestmentLeadsTab,
  waitForActiveOpportunityCount,
  searchAllOpportunitiesByEmail,
  rescanMergeChecks,
  openFromAllLeadsByName,
  deleteInvestmentInPlace,
  investmentIdsLeft,
  deleteImportRunRecords,
  printVerify,
} from '@helpers/investment-import-verify.helper';

/** Polls of the CRM list while waiting for the re-scan cron (every 20 min) to merge the two Opportunities. */
const MERGE_POLLS = 15;

/** true keeps every record this run created (debugging only) - the afterEach then removes nothing. */
const SKIP_CLEANUP_CRM3902_121 = false;

/** The record id in an Odoo form URL ("" when there is none). */
const recordId = (url: string): string => /[#&]id=(\d+)/.exec(url)?.[1] ?? '';

/** What THIS run created - the afterEach removes exactly these (captured URLs / the run's own marker). */
const created = {
  investmentUrls: [] as string[],
  investmentIds: [] as number[],
  email: '',
  companyNames: [] as string[],
  csvPaths: [] as string[],
};

/** Labels of the verification steps - one source of truth for the test.step() label AND the stdout banner. */
const VERIFY_STEP = {
  v1: 'Verification 1: Right after the import - wait the 90 s no-merge window; CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 2 Opportunities, both Active',
  v2: 'Verification 2: Wait for the "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" job (every 20 min) - poll the CRM list for Email_Contact#1 until exactly 1 active Opportunity remains (up to ~45 min)',
  v3: 'Verification 3: CRM > Archive > All, search Email_Contact#1 -> exactly 2 Opportunities; open each - 1 Active (Lost Reason blank, Tags include "Can_Merge" and "test"), 1 merged (Active = FALSE, Lost Reason = Duplicate); the survivor stays on its own Investment\'s Leads tab',
} as const;

/**
 * Investments - Verify value of "Investment" field from a Source Lead to Target Lead
 * Test Case ID: CRM-3902_1.2.1
 * Automation-Type: refactored
 * Automation-Date: 2026-10-27
 * Jira: CRM-9963 (source manual TC, ID renamed 1.2 -> 1.2.1 and "Investment ID" CSV column added 2026-10-19;
 *       Expected Result added 2026-10-21, updated 2026-10-21T12:58+0300 - re-checked 2026-10-27, unchanged)
 * Run as : Odoo Administrator (users.admin_crm)
 * NOTE: the Expected Result is the pre-production baseline measured 2026-10-21 with THIS spec (2 runs): the
 *       import does not merge; the "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" cron merges the two
 *       Opportunities 18-27 min later; no Investment is transferred; the survivor is NOT fixed.
 *
 * CHANGE 2026-10-27 - root cause of the dropped "I. Edit Opp - Step 8 SAVE" (runs v6/v7/v8 of 2026-10-21), measured:
 *   the Opportunity form was still LOADING when step 6 ran. Step 5 waited a FIXED 5 s (searchOppWait) after the row
 *   click; the form needed 4.5 s in the 2026-10-27 probe (0.5 s margin) and more than that in v7 (the v7 video shows
 *   the list with "Loading" until the form renders, then the form in READ mode only - never in edit mode).
 *   OpportunityPage.clickEdit() then found no Edit button and returned false WITHOUT waiting, fillLeadForm() found no
 *   input and returned false, the spec ignored both return values and printed "Edit mode activated" / "Lead form set",
 *   and step 8 timed out waiting for a SAVE button that a READ-mode form never shows. The edit was never dropped -
 *   it was never made. "CRM Developer > Processing" is not a readiness signal: it stays TRUE on every imported lead
 *   (all 14 leads of 2026-10-21 still read processing = True), and the import's queue jobs are done ~10 s after the
 *   import. Probe: tests/demo_test/Investment/tc-explore-20261027-21-step-i-dropped-edit.spec.ts (PROBE_REPRO=1
 *   reproduces it). Fix: step 5 waits (bounded) for the form URL with the record id and the toolbar EDIT button;
 *   steps 6-8 now ASSERT edit mode, the Lead Form input, and the saved Lead Form value read back after SAVE.
 *   Also: the CSV files carry the run id (the old fixed names overwrote / deleted the tracked CSV-Audience-copy2.csv),
 *   and an afterEach removes everything the run created (see Tear down) - earlier runs left their leads behind.
 *   Verification 3 now reads the Investment on BOTH Opportunity forms (the field IS on the pre-production form when
 *   set - the 2026-10-21 survey that said otherwise had opened records whose Investment was already deleted).
 *
 * Summary: Verify the value of "Investment" field from a Source Lead to Target Lead after importing new audience using csv file
 *
 * Command to run:
 * npx playwright test tc-crm-3902-1-2-1 --grep "CRM-3902_1\.2\.1:" --project=chromium-headless
 *
 * Pre-condition #1:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment (Name_Investment#1) with fields:
 *    - Investment Name, Investment ID, Type=Webinar, Channel, Countries=Albania
 *    - Date start/end = current date, Responsible Sales/Marketing, NBR Product List=M365
 *    - Completion/Conversion Events, Track conversion dates
 * 5. Create CSV-Audience-copy1 (SOURCE contact):
 *    - Contact Name  = TEST_SOURCE_name_<timestamp>  (Name_Contact#1)
 *    - Email         = Test@company<datetime>.com     (Email_Contact#1)
 *    - Company       = TEST_company_name_<timestamp>
 *    - Phone         = 1234125125  |  Country = China
 *    - Sales Team    = CMR         |  Salesperson = Sergey Karachin
 *    - Tags          = test        |  Create manually = FALSE
 *    - Investment ID = value of the "Investment ID" textbox of Investment#1 (step 4)
 *
 * Steps to reproduce #1:
 * 1. On Investment#1 page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3-5. Upload CSV-Audience-copy1 file
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 * 8. Copy the current URL as URL_Investment#1
 * 9. Press "Application" button to back to Home page
 *
 * I. Edit Opportunity:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Search" textbox, remove "My Pipeline" and wait
 * 4. On "Search" textbox, enter value of Email_Contact#1 then press Enter to search
 * 5. On "Opp" page, click at the line of "Email" = value of Email_Contact#1
 * 6. On "Opp" page, press "EDIT" button and wait
 * 7. Click at "CRM Developer" tab at the bottom of page
 *    - Lead form textbox = License
 * 8. Press "SAVE" button
 * 9. Copy URL of Opp#1, called URL_Opp#1
 * 10. Press "Application" button to back to Home page
 *
 * Pre-condition #2:
 * 1. On "Home" page, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox = TEST Investment 2 + current date time
 * 5. Create CSV-Audience-copy2 (TARGET contact — same Email_Contact#1):
 *    - Contact Name  = TEST_TARGET_<timestamp>
 *    - Email         = Email_Contact#1 (reused from Pre-condition #1)
 *    - Company, Phone, Country, Sales Team, Salesperson same as #1
 *    - Tags          = Can_Merge      |  Create manually = TRUE
 *    - Investment ID = value of the "Investment ID" textbox of Investment#2 (step 4)
 *
 * Steps to reproduce #2:
 * 1. On Investment#2 page, press "EDIT" button and wait
 * 2. Click at "Audience" tab
 * 3-5. Upload CSV-Audience-copy2 file
 * 6. Press "IMPORT" button and wait
 * 7. Press "SAVE" button on Investment page
 *
 * Expected result (pre-production baseline, measured 2026-10-21 on 2 runs; crm-mig behaves the same):
 * 1. Right after Steps to reproduce #2 the import does NOT merge: CRM > list view, remove "My Pipeline",
 *    search Email_Contact#1 -> exactly 2 Opportunities, both Active = TRUE.
 * 2. The "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" job (every 20 min) then merges them -
 *    observed 18-27 min after the import. After it, search Email_Contact#1 including archived records
 *    -> still exactly 2 Opportunities:
 *    - exactly 1 Active = TRUE, Lost Reason = blank; its Tags include "Can_Merge" and "test"
 *    - exactly 1 Active = FALSE, Lost Reason = Duplicate
 * 3. No Investment is transferred: whichever Opp survives (both directions were observed), the Opp of
 *    CSV-Audience-copy1 keeps Name_Investment#1 and the Opp of CSV-Audience-copy2 keeps Name_Investment#2.
 * Verification 1 waits the team's 90 s no-merge window; Verification 2 polls the default CRM list every
 * CommonUtils.waitTimes.mergeReverifyBudget (2.5 min), up to 15 polls (~45 min) - this test runs with a 75-min
 * budget. Point 3 is read on each Opportunity's own form (Investment = "<Investment ID> - <Investment Name>"),
 * and for the survivor also on the Leads tab of its own Investment (a transferred Investment would move it).
 *
 * Guard checks (not expected results of the TC - they prove its steps happened):
 *   I.6 the form is in EDIT mode | I.7 the "Lead form" textbox exists | I.8 the saved Lead Form reads "License".
 *
 * Tear down:
 * 1. Delete Investment#2 record
 * 2. Navigate to URL_Investment#1 and delete Investment#1
 * 3. Delete both CSV files (named CSV-Audience-copy1-<runId>.csv / CSV-Audience-copy2-<runId>.csv)
 * afterEach (added 2026-10-27, runs on a FAIL too; SKIP_CLEANUP_CRM3902_121=true keeps the records): deletes any
 * Investment of this run still there (by its captured URL), then the Opportunities (both, the merged one included)
 * and the contacts this run's imports created - found ONLY by this run's marker (Email_Contact#1 and the two
 * TEST_company_name_<timestamp> names), refused when more rows match than 2 leads / 4 contacts - and reads back that
 * none is left.
 */

test.describe('CRM-3902_1.2.1 - Verify the value of "Investment" field from a Source Lead to Target Lead after importing new audience using csv file', () => {

  test.beforeEach(async ({ page, context }) => {
    // Clear cookies to ensure fresh state
    await context.clearCookies();

    // Deny geolocation permission to prevent "Know your location" popup
    await context.grantPermissions([]);

    // Small delay to ensure session cleanup between tests
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
    created.investmentUrls = [];
    created.investmentIds = [];
    created.email = '';
    created.companyNames = [];
    created.csvPaths = [];
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    console.log('\n--- afterEach: remove what this run created ---');
    console.log(`  - Investments still to delete : ${created.investmentUrls.length ? created.investmentUrls.join(' | ') : '(none - the tear-down steps deleted them)'}`);
    console.log(`  - Run marker (e-mail)         : ${created.email || '(not created)'}`);
    console.log(`  - Run marker (companies)      : ${created.companyNames.join(' | ') || '(not created)'}`);
    if (SKIP_CLEANUP_CRM3902_121) {
      console.log('  SKIP_CLEANUP_CRM3902_121 = true - records KEPT');
      return;
    }
    const problems: string[] = [];
    // A FAILED form may still be in edit mode: Discard first, so the navigation below is not refused.
    await new OpportunityPage(page).discardFormIfInEditMode().catch(() => {});
    for (const url of [...created.investmentUrls]) {
      try {
        await deleteInvestmentInPlace(page, url);
        created.investmentUrls = created.investmentUrls.filter((u) => u !== url);
        console.log(`  deleted   Investment ${url}`);
      } catch (e) {
        problems.push(`Investment ${url}: ${String(e).split('\n')[0]}`);
      }
    }
    const investmentsLeft = await investmentIdsLeft(page, created.investmentIds)
      .catch((e) => { problems.push(`Investment read-back: ${String(e).split('\n')[0]}`); return [] as number[]; });
    console.log(`  READ-BACK Investments left : ${investmentsLeft.length}${investmentsLeft.length ? ` (${investmentsLeft.join(', ')})` : ''} of ${created.investmentIds.join(', ') || '(none created)'}`);
    if (investmentsLeft.length) problems.push(`left on pre-production: Investment [${investmentsLeft.join(', ')}]`);
    if (created.email) {
      const r = await deleteImportRunRecords(page, { email: created.email, companyNames: created.companyNames }, { leads: 2, partners: 4 })
        .catch((e) => { problems.push(`lead/contact teardown: ${String(e).split('\n')[0]}`); return null; });
      if (r) {
        console.log(`  found     crm.lead    : ${r.found.leadIds.join(', ') || '(none)'}`);
        console.log(`  found     res.partner : ${r.found.partnerIds.join(', ') || '(none)'}`);
        if (r.refused) problems.push(r.refused);
        problems.push(...r.errors);
        console.log(`  READ-BACK crm.lead left    : ${r.left.leadIds.length}${r.left.leadIds.length ? ` (${r.left.leadIds.join(', ')})` : ''}`);
        console.log(`  READ-BACK res.partner left : ${r.left.partnerIds.length}${r.left.partnerIds.length ? ` (${r.left.partnerIds.join(', ')})` : ''}`);
        if (r.left.leadIds.length || r.left.partnerIds.length) {
          problems.push(`left on pre-production: crm.lead [${r.left.leadIds.join(', ')}] res.partner [${r.left.partnerIds.join(', ')}]`);
        }
      }
    }
    for (const file of created.csvPaths) {
      if (fs.existsSync(file)) { fs.unlinkSync(file); console.log(`  deleted   file ${file}`); }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
    if (problems.length) {
      throw new Error(`Teardown incomplete - remove by hand:\n  ${problems.join('\n  ')}`);
    }
    console.log('  Teardown verified: no record of this run is left');
  });

  test('CRM-3902_1.2.1: Verify the value of "Investment" field from a Source Lead to Target Lead after importing new audience using csv file', async ({ page }, testInfo) => {
    // Setup (~15 min budget) + the re-scan wait (MERGE_POLLS x mergeReverifyBudget) + the final reads (~15 min).
    test.setTimeout(config.timeouts.test * 2 + MERGE_POLLS * CommonUtils.waitTimes.mergeReverifyBudget);

    // Maximize browser window
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Compute date values
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const currentDate = `${mm}/${dd}/${yyyy}`;

    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const smYYYY = sixMonthsLater.getFullYear();
    const smMM = String(sixMonthsLater.getMonth() + 1).padStart(2, '0');
    const smDD = String(sixMonthsLater.getDate()).padStart(2, '0');
    const dateEndPlus6Months = `${smMM}/${smDD}/${smYYYY}`;

    const timestamp = CommonUtils.generateTimestamp();
    const investmentName1 = `TEST Investment ${timestamp}`;
    const investmentID1   = `TEST-Investment-${timestamp}`;
    const investmentName2 = `TEST Investment 2 ${CommonUtils.generateTimestamp()}`;
    const investmentID2   = `TEST-Investment-2-${CommonUtils.generateTimestamp()}`;

    // Initialize page objects
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const investmentPage = new InvestmentPage(page);
    const opportunityPage = new OpportunityPage(page);

    // Track file paths for tear down
    let csvCopy1Path = '';
    let csvCopy2Path = '';
    let urlInvestment1 = '';
    let urlOpp1 = '';
    let urlInvestment2 = '';

    // ============================================================
    // PRE-CONDITION #1
    // ============================================================

    // Pre-condition #1 Step 1: Login and navigate to Investments
    await test.step('Pre-condition #1 Step 1: Login and navigate to Investments module', async () => {
      console.log(`\n=== PRE-CONDITION #1 ===`);
      console.log(`Step 1: Logging in as ${users.admin_crm.displayName}`);

      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();

      console.log('✓ Login successful');

      await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);

      console.log('✓ Navigated to Investments module');
    });

    // Pre-condition #1 Step 2: Navigate to Investment menu item
    await test.step('Pre-condition #1 Step 2: Navigate to Investment', async () => {
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });

    // Pre-condition #1 Step 3: Press CREATE button
    await test.step('Pre-condition #1 Step 3: Press CREATE button', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Pre-condition #1 Step 4: Create blank Investment#1
    await test.step('Pre-condition #1 Step 4: Create blank Investment#1 (Name_Investment#1)', async () => {
      console.log('=== PRE-CONDITION #1 STEP 4: CREATE INVESTMENT#1 ===');

      await investmentPage.createBlankInvestment({
        investmentName: investmentName1,
        investmentID: investmentID1,
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

      console.log(`✓ Investment#1 created: ${investmentName1}`);
      if (recordId(page.url())) { created.investmentUrls.push(page.url()); created.investmentIds.push(Number(recordId(page.url()))); }
    });

    // Pre-condition #1 Step 5: Create CSV-Audience-copy1 (SOURCE contact, createManually=FALSE)
    let csvData1 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;
    let csvData2 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    await test.step('Pre-condition #1 Step 5: Create CSV-Audience-copy1 (SOURCE contact, createManually=FALSE)', async () => {
      console.log('=== PRE-CONDITION #1 STEP 5: CREATE CSV-AUDIENCE-COPY1 ===');

      csvData1 = await investmentPage.createImportAudienceFile({
        contactName:   `TEST_SOURCE_name_${timestamp}`,
        tags:          'test',
        createManually: 'FALSE',
        investmentId:   investmentID1,
        outputFileName: `CSV-Audience-copy1-${timestamp}.csv`,
      });
      csvCopy1Path = csvData1.outputPath;
      created.csvPaths.push(csvCopy1Path);
      created.email = csvData1.emailContact1;
      created.companyNames.push(csvData1.companyName);

      expect(fs.existsSync(csvCopy1Path), `CSV-Audience-copy1 not found at: ${csvCopy1Path}`).toBeTruthy();

      console.log('  ✓ CSV-Audience-copy1 created');
      console.log(`  ✓ Name_Contact#1    : ${csvData1.contactName}`);
      console.log(`  ✓ Email_Contact#1   : ${csvData1.emailContact1}  (will be reused in copy2)`);
      console.log(`  ✓ Create manually   : FALSE`);
    });

    console.log('\n✅ PRE-CONDITION #1 SETUP COMPLETED');

    // Steps to reproduce #1 — Step 1: Edit Investment#1
    await test.step('Steps #1 - Step 1: Press "EDIT" button on Investment#1', async () => {
      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');
    });

    // Steps to reproduce #1 — Step 2: Click Audience tab
    await test.step('Steps #1 - Step 2: Click "Audience" tab', async () => {
      await investmentPage.clickAudienceTab();
      console.log('✓ Audience tab clicked');
    });

    // Steps to reproduce #1 — Steps 3-5: Upload CSV-Audience-copy1
    await test.step('Steps #1 - Step 3-5: Upload CSV-Audience-copy1', async () => {
      await investmentPage.uploadAudienceCSV(csvCopy1Path);
      console.log(`✓ CSV-Audience-copy1 uploaded: ${csvCopy1Path}`);
    });

    // Steps to reproduce #1 — Step 6: Import
    await test.step('Steps #1 - Step 6: Press "IMPORT" button', async () => {
      await investmentPage.clickImportButton();
      console.log('✓ Import completed');
    });

    // Steps to reproduce #1 — Step 7: Save
    await test.step('Steps #1 - Step 7: Press "SAVE" button', async () => {
      await investmentPage.clickSaveButton();
      console.log('✓ Save triggered');
    });

    // Steps to reproduce #1 — Step 8: Copy URL
    await test.step('Steps #1 - Step 8: Copy current URL as URL_Investment#1', async () => {
      urlInvestment1 = page.url();
      console.log(`✓ URL_Investment#1: ${urlInvestment1}`);
    });

    // Steps to reproduce #1 — Step 9: Navigate back to Home
    await test.step('Steps #1 - Step 9: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ STEPS TO REPRODUCE #1 COMPLETED');

    // ============================================================
    // I. EDIT OPPORTUNITY
    // ============================================================

    // I. Step 1: Click CRM button
    await test.step('I. Edit Opp - Step 1: Click "CRM" button', async () => {
      console.log('\n=== I. EDIT OPPORTUNITY ===');
      await homePage.navigateToCRM();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated to CRM page');
    });

    // I. Step 2: Switch to list view
    await test.step('I. Edit Opp - Step 2: Click "view list" button on CRM page', async () => {
      await opportunityPage.switchToListView();
      console.log('✓ Switched to list view');
    });

    // I. Step 3: Remove "My Pipeline" filter
    await test.step('I. Edit Opp - Step 3: Remove "My Pipeline" filter from Search', async () => {
      await opportunityPage.removeMyPipelineFilter();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('✓ "My Pipeline" filter removed');
    });

    // I. Step 4: Search by Email_Contact#1
    await test.step('I. Edit Opp - Step 4: Search for Email_Contact#1 in Search textbox', async () => {
      await opportunityPage.searchByEmail(csvData1.emailContact1);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`✓ Searched for: ${csvData1.emailContact1}`);
    });

    // I. Step 5: Click the Opp row matching Email_Contact#1
    await test.step('I. Edit Opp - Step 5: Click Opp row where Email = Email_Contact#1 and wait until the Opportunity form has opened (right after an import it can take more than 5 s)', async () => {
      await opportunityPage.clickOppRowByEmail(csvData1.emailContact1);
      console.log(`✓ Clicked Opp row with email: ${csvData1.emailContact1}`);
      // Root cause of the 2026-10-21 v6/v7/v8 failures: the click above waits a FIXED searchOppWait (5 s), the form
      // took longer, and step 6 then found no EDIT button (clickEdit() does not wait for one). Bounded wait for the
      // real readiness signal: the form URL carries the record id, and the toolbar EDIT button is drawn.
      await opportunityPage.waitForURL(/[#&]id=\d+.*view_type=form/, CommonUtils.waitTimes.pageLoad);
      await opportunityPage.waitForEditButton(CommonUtils.waitTimes.abnormalWait, CommonUtils.waitTimes.standard);
      console.log(`  - Opportunity form open : ${page.url()}`);
    });

    // I. Step 6: Press EDIT button
    await test.step('I. Edit Opp - Step 6: Press "EDIT" button on Opp page', async () => {
      const editFound = await opportunityPage.clickEdit();
      const editable = await opportunityPage.isFormEditable();
      console.log(`  - EDIT button found     : ${editFound}`);
      console.log(`  - Form in EDIT mode     : ${editable}`);
      expect(editFound && editable, '(guard) the Opportunity form is in EDIT mode after pressing EDIT').toBe(true);
      console.log('✓ Edit mode activated on Opp');
    });

    // I. Step 7: Click CRM Developer tab and set Lead form = License
    await test.step('I. Edit Opp - Step 7: Click "CRM Developer" tab and fill Lead form = "License"', async () => {
      await opportunityPage.clickCRMDeveloperTab();
      console.log('✓ CRM Developer tab opened');
      const filled = await opportunityPage.fillLeadForm('License');
      console.log(`  - "Lead form" textbox found and filled : ${filled}`);
      expect(filled, '(guard) the "Lead form" textbox is on the CRM Developer tab in EDIT mode').toBe(true);
      console.log('✓ Lead form set to: License');
    });

    // I. Step 8: Press SAVE
    await test.step('I. Edit Opp - Step 8: Press "SAVE" button', async () => {
      await opportunityPage.clickSave();
      // Saved = the form left EDIT mode (Odoo re-reads the record from the server after the write).
      await expect.poll(() => opportunityPage.isFormEditable(), {
        message: '(guard) the Opportunity form returns to READ mode after SAVE',
        timeout: CommonUtils.waitTimes.savingPage,
      }).toBe(false);
      const savedLeadForm = (await opportunityPage.getLeadFormValue()).trim();
      const passed = savedLeadForm === 'License';
      const lines = [
        '(guard) Lead Form of the saved Opportunity:',
        '   Expected : License',
        `   Actual   : ${savedLeadForm || '(blank)'}`,
        `   Result   : ${passed ? 'PASS' : 'FAIL'}`,
      ];
      lines.forEach((l) => console.log(`  ${l}`));
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'CRM-3902_1.2.1 - I.8 Lead Form saved (guard)', passed, lines }).catch(() => {});
      expect(savedLeadForm, '(guard) the saved Opportunity reads Lead Form = License').toBe('License');
      console.log('✓ Opp saved');
    });

    // I. Step 9: Copy URL of Opp#1
    await test.step('I. Edit Opp - Step 9: Copy URL of Opp#1 as URL_Opp#1', async () => {
      urlOpp1 = page.url();
      console.log(`✓ URL_Opp#1: ${urlOpp1}`);
    });

    // I. Step 10: Press Application button to back to Home page
    await test.step('I. Edit Opp - Step 10: Press "Application" button to back to Home page', async () => {
      await homePage.clickApplicationMenu();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('✓ Navigated back to Home page');
    });

    console.log('\n✅ I. EDIT OPPORTUNITY COMPLETED');

    // ============================================================
    // PRE-CONDITION #2
    // ============================================================

    // Pre-condition #2 Step 1. On "Home" page, click at "Investments" button
    await test.step('Pre-condition #2 Step 1: Click "Investments" button on Home page', async () => {
      console.log('\n=== PRE-CONDITION #2 ===');
       await homePage.navigateToInvestment();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
    });
// Pre-condition #2 Step 2: Navigate to Investment menu item
    await test.step('Pre-condition #2 Step 2: Navigate to Investment', async () => {
      await investmentPage.navigateToInvestment();
      console.log('✓ Navigated to Investment page');
    });
    // Pre-condition #2 Step 3: Press CREATE button
    await test.step('Pre-condition #2 Step 3: Press CREATE button', async () => {
      await investmentPage.clickCreateButton();
      console.log('✓ Create form opened');
    });

    // Pre-condition #2 Step 4: Create blank Investment#2
    await test.step('Pre-condition #2 Step 4: Create blank Investment#2 (Name_Investment#2)', async () => {
      console.log('=== PRE-CONDITION #2 STEP 4: CREATE INVESTMENT#2 ===');

      await investmentPage.createBlankInvestment({
        investmentName: investmentName2,
        investmentID: investmentID2,
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

      console.log(`✓ Investment#2 created: ${investmentName2}`);
      if (recordId(page.url())) { created.investmentUrls.push(page.url()); created.investmentIds.push(Number(recordId(page.url()))); }
    });

    // Pre-condition #2 Step 5: Create CSV-Audience-copy2 (TARGET contact, same email, createManually=TRUE)
    await test.step('Pre-condition #2 Step 5: Create CSV-Audience-copy2 (TARGET contact)', async () => {
      console.log('=== PRE-CONDITION #2 STEP 5: CREATE CSV-AUDIENCE-COPY2 ===');

      csvData2 = await investmentPage.createImportAudienceFile({
        contactName:    `TEST_TARGET_${CommonUtils.generateTimestamp()}`,
        email:          csvData1.emailContact1,
        tags:           'Can_Merge',
        createManually: 'TRUE',
        investmentId:   investmentID2,
        outputFileName: `CSV-Audience-copy2-${timestamp}.csv`,
      });
      csvCopy2Path = csvData2.outputPath;
      created.csvPaths.push(csvCopy2Path);
      created.companyNames.push(csvData2.companyName);

      expect(fs.existsSync(csvCopy2Path), `CSV-Audience-copy2 not found at: ${csvCopy2Path}`).toBeTruthy();

      console.log('  ✓ CSV-Audience-copy2 created');
      console.log(`  ✓ Name (TARGET)    : ${csvData2.contactName}`);
      console.log(`  ✓ Email (reused)   : ${csvData2.emailContact1}`);
      console.log('  ✓ Tags             : Can_Merge');
      console.log('  ✓ Create manually  : TRUE');
    });

    console.log('\n✅ PRE-CONDITION #2 SETUP COMPLETED');

    // Steps to reproduce #2 — Step 1: Edit Investment#2
    await test.step('Steps #2 - Step 1: Press "EDIT" button on Investment#2', async () => {
      await investmentPage.clickEditButton();
      console.log('✓ Edit mode activated');
    });

    // Steps to reproduce #2 — Step 2: Click Audience tab
    await test.step('Steps #2 - Step 2: Click "Audience" tab', async () => {
      await investmentPage.clickAudienceTab();
      console.log('✓ Audience tab clicked');
    });

    // Steps to reproduce #2 — Steps 3-5: Upload CSV-Audience-copy2
    await test.step('Steps #2 - Step 3-5: Upload CSV-Audience-copy2', async () => {
      await investmentPage.uploadAudienceCSV(csvCopy2Path);
      console.log(`✓ CSV-Audience-copy2 uploaded: ${csvCopy2Path}`);
    });

    // Steps to reproduce #2 — Step 6: Import
    await test.step('Steps #2 - Step 6: Press "IMPORT" button', async () => {
      await investmentPage.clickImportButton();
      console.log('✓ Import completed');
    });

    // Steps to reproduce #2 — Step 7: Save
    await test.step('Steps #2 - Step 7: Press "SAVE" button', async () => {
      await investmentPage.clickSaveButton();
      console.log('✓ Save triggered');
      urlInvestment2 = page.url();
      console.log(`  URL_Investment#2 : ${urlInvestment2}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Investment#2 saved after IMPORT');
    });

    await test.step(VERIFY_STEP.v1, async () => {
      console.log(`\n--- ${VERIFY_STEP.v1} ---`);
      await new LeadPage(page).waitForNoMergeConfirmation();
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      const rows = await searchOpportunitiesByEmail(page, csvData1.emailContact1);
      const checks = [{ label: 'Opportunities for Email_Contact#1 in the default list (active only) - both Active', expected: 2, actual: rows }];
      const { allPass, lines } = printVerify(checks, 'the import did not merge the two Opportunities');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'CRM-3902_1.2.1 - right after the import', passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(VERIFY_STEP.v2, async () => {
      console.log(`\n--- ${VERIFY_STEP.v2} ---`);
      const r = await waitForActiveOpportunityCount(page, csvData1.emailContact1, 1, MERGE_POLLS, async () => {
        await homePage.clickApplicationMenu();
        await homePage.navigateToCRM();
      });
      const checks = [{ label: `Active Opportunities for Email_Contact#1 after the re-scan (waited ${r.waitedMin} min, ${r.pollsUsed} polls)`, expected: 1, actual: r.rows }];
      const { allPass, lines } = printVerify(checks, 'the re-scan cron merged the two Opportunities');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'CRM-3902_1.2.1 - after the re-scan', passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(VERIFY_STEP.v3, async () => {
      console.log(`\n--- ${VERIFY_STEP.v3} ---`);
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      const allRows = await searchAllOpportunitiesByEmail(page, csvData1.emailContact1);
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      const rows1 = await openFromAllLeadsByName(page, csvData1.contactName);
      const opp1 = await readMergeOutcome(page, { readInvestmentOnForm: true });
      logMergeOutcome('Opp of CSV-Audience-copy1 read on screen:', opp1);
      await homePage.clickApplicationMenu();
      await homePage.navigateToCRM();
      const rows2 = await openFromAllLeadsByName(page, csvData2.contactName);
      const opp2 = await readMergeOutcome(page, { readInvestmentOnForm: true });
      logMergeOutcome('Opp of CSV-Audience-copy2 read on screen:', opp2);
      // Each Opportunity is opened by its own name (unique per run) - never by the first row of an email search.
      // Expected Result 3 on the forms: each Opp keeps its own Investment ("<Investment ID> - <Investment Name>").
      const { checks: mergeChecks, survivor } = rescanMergeChecks(allRows, opp1, opp2, {
        investment1OnForm: `${investmentID1} - ${investmentName1}`,
        investment2OnForm: `${investmentID2} - ${investmentName2}`,
      });
      const checks = [
        { label: 'Opp of CSV-Audience-copy1 found by its name in Archive > All', expected: 1, actual: rows1 },
        { label: 'Opp of CSV-Audience-copy2 found by its name in Archive > All', expected: 1, actual: rows2 },
        ...mergeChecks,
      ];
      const survivorIsCopy1 = survivor === opp1;
      console.log(`  Observation (not scored) - surviving Opp : ${survivor.opportunity} (${survivorIsCopy1 ? 'CSV-Audience-copy1' : 'CSV-Audience-copy2'})`);
      const ownTab = await readInvestmentLeadsTab(page, survivorIsCopy1 ? urlInvestment1 : urlInvestment2);
      console.log(`  Investment#${survivorIsCopy1 ? 1 : 2} > Leads tab : Opportunity = ${ownTab.opportunity}`);
      checks.push({
        label: `Surviving Opp keeps its own Investment (Name_Investment#${survivorIsCopy1 ? 1 : 2} > Leads tab lists it - not transferred)`,
        expected: survivor.opportunity,
        actual: ownTab.opportunity,
      });
      const { allPass, lines } = printVerify(checks, 'merged by the re-scan, exactly 1 survivor, no Investment transferred');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: 'CRM-3902_1.2.1 - merge outcome', passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    console.log('\n✅ STEPS TO REPRODUCE #2 COMPLETED');
    console.log(`\n  URL_Investment#1 : ${urlInvestment1}`);
    console.log(`  Name_Investment#1 : ${investmentName1}`);
    console.log(`  Name_Investment#2 : ${investmentName2}`);
    console.log(`  Email_Contact#1   : ${csvData1.emailContact1}`);

    // ---- Tear down ----
    await test.step('Tear down Step 1: Delete Investment#2 record', async () => {
      // In place: openInvestmentForm() reloads at Investment#2's URL and checks the id (the verification leaves the
      // page on another Investment), then Action > Delete > OK with the Action menu CONFIRMED open - after a reload
      // its first click is lost (measured 2026-10-27, EXPLORE-20261027_22), which is what "Delete not offered" was.
      await deleteInvestmentInPlace(page, urlInvestment2);
      created.investmentUrls = created.investmentUrls.filter((u) => recordId(u) !== recordId(urlInvestment2));
      console.log(`✓ Investment#2 deleted: ${investmentName2}`);
    });

    await test.step('Tear down Step 2: Navigate to Investment#1 and delete', async () => {
      // In place as well: the reload + id check in openInvestmentForm() closes the 2026-10-19 trap (a same-tab
      // hash-only goto left the PREVIOUS record on screen and deleteCurrentRecord() would have hit it).
      await deleteInvestmentInPlace(page, urlInvestment1);
      created.investmentUrls = created.investmentUrls.filter((u) => recordId(u) !== recordId(urlInvestment1));
      console.log(`✓ Investment#1 deleted: ${investmentName1}`);
    });

    await test.step('Tear down Step 3: Delete CSV files', async () => {
      if (fs.existsSync(csvCopy1Path)) { fs.unlinkSync(csvCopy1Path); console.log(`✓ Deleted: ${csvCopy1Path}`); }
      if (fs.existsSync(csvCopy2Path)) { fs.unlinkSync(csvCopy2Path); console.log(`✓ Deleted: ${csvCopy2Path}`); }
    });

    console.log('\n✅ TEAR DOWN COMPLETED SUCCESSFULLY');
  });
});
