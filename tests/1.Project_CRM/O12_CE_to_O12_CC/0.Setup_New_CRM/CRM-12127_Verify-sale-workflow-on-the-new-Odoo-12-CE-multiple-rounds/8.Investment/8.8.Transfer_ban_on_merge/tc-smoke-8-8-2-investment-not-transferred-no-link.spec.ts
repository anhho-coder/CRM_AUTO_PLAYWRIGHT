import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig, HomePageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { LeadPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  teardownMigRecords,
  listMigCreatedRecords,
} from '@helpers/o12ce-main-business.helper';
import {
  searchOpportunitiesByEmail,
  readMergeOutcome,
  logMergeOutcome,
  waitForActiveOpportunityCount,
  searchAllOpportunitiesByEmail,
  rescanMergeChecks,
  openFromAllLeadsByName,
  printVerify,
} from '@helpers/investment-import-verify.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.8.2 - Investment is not transferred from a Source Lead to the Target Lead,
 *                    Source has no link (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.8.2
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Jira (this TC)             : CRM-13705 (Xray Manual Steps, 21 steps; the Expected Result sits on step 21,
 *                               written 2026-10-21 - a step edit does not move `updated`, so diff the step text)
 *  Source TC (pre-production) : CRM-3902_1.2.1 (Jira CRM-9963, updated 2026-10-21T10:28+0300 - re-check before trusting this spec)
 *  Expected Result            : pre-production baseline measured 2026-10-21 (Opportunities #1101509/#1101510),
 *                               master 'Migration - Setup New CRM' J411
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3902_Investment_transfer_ban_on_merge/
 *                               1.Target_Lead/1.2.Source_no_link/tc-crm-3902-1-2-investment-not-transferred.spec.ts
 *  Source version             : UNTRACKED in git (no commit yet) + uncommitted working-tree edits, read 2026-10-19
 *
 * --------------------------------------------------------------------------------------------
 *  KNOWN BLOCKER (2026-10-19)
 * --------------------------------------------------------------------------------------------
 *  Step 6 of Steps #1 (IMPORT of CSV-Audience-copy1) is refused by the crm-mig server, so this spec
 *  is RED by design until the server is fixed. Quoted error:
 *    IMPORT refused by the server (Odoo Server Error): AttributeError: 'bool' object has no attribute 'keys'
 *    nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, in _check_is_valid:
 *      pdDatas['isSalePerson'] = [not d or d and d in list(salespersons.keys()) ...]
 *  Everything after it (the Opportunity edit, the second import) is ported faithfully and is not
 *  reached until the import is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  SOURCE STATUS - read before trusting this spec
 * --------------------------------------------------------------------------------------------
 *  CRM-9963 carried no expected result until 2026-10-21. It was then written from the pre-production
 *  baseline (2 runs of CRM-3902_1.2.1, crm-mig behaving the same): the import does NOT merge the two
 *  Opportunities; the "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" cron (every 20 min) merges
 *  them 18-27 min later, and no Investment is transferred. WHICH Opportunity survives is not fixed - both
 *  directions were measured - so no check assumes it. (A first version, "never merged", rested on a
 *  9-minute look and was wrong; replaced the same day with the tester's approval.)
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates two Investments. Investment#1 imports a SOURCE contact and the Opportunity it creates is
 *  edited (CRM Developer tab, Lead form = License, SAVE). Investment#2 imports a TARGET contact with
 *  the same email, then verifies on screen: 2 active Opportunities right after the import, then - once the
 *  re-scan cron has merged them (polled up to 45 min) - exactly 1 active + 1 merged, each keeping its Investment.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.8\.2:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE)
 * --------------------------------------------------------------------------------------------
 *  - The audience files now carry the Investment ID of their own Investment (#1 / #2). The
 *    pre-production source leaves that column empty and crm-mig refuses it with
 *    'Lines [2] "Investment ID" is empty' (seen 2026-10-20 on CRM-12370_8.5.1).
 *  - Login users.admin_crm_mig on baseUrl_mig; Investments navigation by XML-id URL hash
 *    (InvestmentPageMig); Home by HomePageMig.returnToHome; CRM by InvestmentPageMig.openCrmPipeline (verified on the "Pipeline" breadcrumb).
 *  - Investment names carry the run marker "TEST CRM-12370_8.8.2 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - Audience files: CSV-Audience-CRM-12370_8.8.2-1.csv and -2.csv (unique per TC).
 *  - Pre-condition 2 "Steps 1-2" (Home > Investments, then Investment) folded into one navigation step.
 *  - Tear-down steps of the source (delete Investment#2, open URL_Investment#1 and delete it, delete
 *    both CSVs) are replaced by the afterEach ledger teardown (RPC, deny-list) and the file removal.
 *  - OpportunityPage is the pre-production page object (Edit / CRM Developer / Lead form / Save).
 *    It has no crm-mig variant yet (see report); it is called as written.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition #1:
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment (Name_Investment#1): Investment Name = TEST Investment + <datetime>,
 *       Investment ID = TEST-Investment-<datetime>, Type = Webinar, Channel = Channel, Countries = Albania,
 *       Date start/end = current date, Responsible Sales = Aleksey Galbur, Responsible Marketing = Nadiia Suprun,
 *       NBR Product List = M365, Completion Events = Attended webinar, Conversion Events = Download free trial,
 *       Track conversion date start = current date, Track conversion date end = current date + 6 months
 *    5. Create CSV-Audience-copy1 (SOURCE contact):
 *         - Contact Name = TEST_SOURCE_name_<timestamp>                  (Name_Contact#1)
 *         - Email        = Test@company<datetime>.com                    (Email_Contact#1)
 *         - Phone = 1234125125 | Country = China | Sales Team = CMR | Salesperson = Sergey Karachin
 *         - Tags = test | Create manually = FALSE | Investment ID = <Investment ID of Investment #1>
 *  Steps to reproduce #1:
 *    1. On Investment#1 page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3-5. Upload CSV-Audience-copy1 file
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *    8. Copy the current URL as URL_Investment#1
 *    9. Press "Application" button to back to Home page
 *  I. Edit Opportunity:
 *    1. Click at "CRM" button
 *    2. On "CRM" page, click at "view list" button
 *    3. On "Search" textbox, remove "My Pipeline" and wait
 *    4. On "Search" textbox, enter value of Email_Contact#1 then press Enter to search
 *    5. On "Opp" page, click at the line of "Email" = value of Email_Contact#1
 *    6. On "Opp" page, press "EDIT" button and wait
 *    7. Click at "CRM Developer" tab at the bottom of page (Lead form = "License")
 *    8. Press "SAVE" button
 *    9. Copy URL of Opp#1, called URL_Opp#1
 *    10. Press "Application" button to back to Home page
 *  Pre-condition #2:
 *    1. On "Home" page, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment (Name_Investment#2): Investment Name = TEST Investment 2 + <datetime>, other fields as #1
 *    5. Create CSV-Audience-copy2 (TARGET contact):
 *         - Contact Name = TEST_TARGET_<timestamp> | Email = Email_Contact#1 (reused)
 *         - Tags = Can_Merge | Create manually = TRUE | Investment ID = <Investment ID of Investment #2> | Company, Phone, Country, Sales Team, Salesperson as #1
 *  Steps to reproduce #2:
 *    1. On Investment#2 page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3-5. Upload CSV-Audience-copy2 file
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *  Expected Result (step 21, pre-production baseline measured 2026-10-21 on 2 runs; crm-mig the same):
 *    1. Right after Steps to reproduce #2 the import does NOT merge: CRM > list view, remove "My Pipeline",
 *       search Email_Contact#1 -> exactly 2 Opportunities, both Active = TRUE.
 *    2. The "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" job (every 20 min) then merges them -
 *       observed 18-27 min after the import. After it, search Email_Contact#1 including archived records
 *       -> still exactly 2 Opportunities:
 *       - exactly 1 Active = TRUE, Lost Reason = blank; its Tags include "Can_Merge" and "test"
 *       - exactly 1 Active = FALSE, Lost Reason = Duplicate
 *    3. No Investment is transferred: whichever Opp survives (both directions were observed), the Opp of
 *       CSV-Audience-copy1 keeps Name_Investment#1 and the Opp of CSV-Audience-copy2 keeps Name_Investment#2.
 *  Verification 1 waits the team's 90 s no-merge window first. Verification 2 polls the default list every
 *  CommonUtils.waitTimes.mergeReverifyBudget (2.5 min), up to 15 polls (~45 min incl. navigation), so this
 *  test runs with a 75-min budget. Email_Contact#1 is unique to the run: the counts start from 0.
 * ============================================================================================
 */

const TC = 'CRM-12370_8.8.2';

/** Polls of the CRM list while waiting for the re-scan cron (every 20 min) to merge the two Opportunities. */
const MERGE_POLLS = 15;

/** Investment master data - crm-mig substitutions are documented in the header. */
const INVESTMENT_DATA = {
  type: 'Webinar',
  channel: 'Channel',
  countries: 'Albania',
  responsibleSales: 'Aleksey Galbur',
  responsibleMarketing: 'Nadiia Suprun',
  nbrProductList: 'M365',
  completionEvents: 'Atttended webinar',
  conversionEvents: 'Downloaded free trial',
} as const;

/** Step labels - one source of truth for the test.step() label AND the stdout banner. */
const STEP = {
  pre1: 'Pre-condition 1: Login as Admin on crm-mig and navigate to the Investments module',
  pre2: 'Pre-condition 2: On "Investments" page, select "Investment" from the top menu',
  pre3: 'Pre-condition 3: Press "CREATE" button and wait for the form to open',
  pre4: 'Pre-condition 4: Create a blank Investment#1 (Name_Investment#1)',
  pre5: 'Pre-condition 5: Create CSV-Audience-copy1 (SOURCE contact, Create manually = FALSE)',
  s1: 'Steps #1 - Step 1: Press "EDIT" button on Investment#1',
  s2: 'Steps #1 - Step 2: Click "Audience" tab',
  s3: 'Steps #1 - Step 3-5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy1',
  s4: 'Steps #1 - Step 6: Press "IMPORT" button and wait',
  s5: 'Steps #1 - Step 7: Press "SAVE" button on Investment page',
  s6: 'Steps #1 - Step 8: Copy current URL as URL_Investment#1',
  s7: 'Steps #1 - Step 9: Press "Application" button to back to Home page',
  i1: 'I. Edit Opp - Step 1: Click "CRM" button',
  i2: 'I. Edit Opp - Step 2: Click "view list" button on CRM page',
  i3: 'I. Edit Opp - Step 3: Remove "My Pipeline" filter from Search',
  i4: 'I. Edit Opp - Step 4: Search for Email_Contact#1 in Search textbox',
  i5: 'I. Edit Opp - Step 5: Click Opp row where Email = Email_Contact#1',
  i6: 'I. Edit Opp - Step 6: Press "EDIT" button on Opp page',
  i7: 'I. Edit Opp - Step 7: Click "CRM Developer" tab and fill Lead form = "License"',
  i8: 'I. Edit Opp - Step 8: Press "SAVE" button',
  i9: 'I. Edit Opp - Step 9: Copy URL of Opp#1 as URL_Opp#1',
  i10: 'I. Edit Opp - Step 10: Press "Application" button to back to Home page',
  p2a: 'Pre-condition 2 Steps 1-2: Click "Investments" on Home page, then select "Investment"',
  p2c: 'Pre-condition 2 Step 3: Press "CREATE" button and wait',
  p2d: 'Pre-condition 2 Step 4: Create a blank Investment#2 (Name_Investment#2)',
  p2e: 'Pre-condition 2 Step 5: Create CSV-Audience-copy2 (TARGET contact, reuses Email_Contact#1)',
  t1: 'Steps #2 - Step 1: Press "EDIT" button on Investment#2',
  t2: 'Steps #2 - Step 2: Click "Audience" tab',
  t3: 'Steps #2 - Step 3-5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy2',
  t4: 'Steps #2 - Step 6: Press "IMPORT" button and wait',
  t5: 'Steps #2 - Step 7: Press "SAVE" button on Investment page',
  v1: 'Verification 1: Right after the import - wait the 90 s no-merge window; CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 2 Opportunities, both Active',
  v2: 'Verification 2: Wait for the "NAKIVO: Re-scan same-email duplicate leads (CRM-12621)" job (every 20 min) - poll the CRM list for Email_Contact#1 until exactly 1 active Opportunity remains (up to ~45 min)',
  v3: 'Verification 3: CRM > Archive > All, search Email_Contact#1 -> exactly 2 Opportunities; open each - 1 Active (Lost Reason blank, Tags include "Can_Merge" and "test"), 1 merged (Active = FALSE, Lost Reason = Duplicate), each keeps its own Investment',
} as const;

/** Per-test state the afterEach needs. */
let investmentId1 = 0;
let investmentId2 = 0;
let audienceEmail = '';
let audienceCompany1 = '';
let audienceCompany2 = '';
let audienceFile1 = '';
let audienceFile2 = '';

test.describe(`${TC} - Investment is not transferred on merge (Source has no link)`, () => {
  test.beforeEach(async ({ context, page }) => {
    investmentId1 = 0;
    investmentId2 = 0;
    audienceEmail = '';
    audienceCompany1 = '';
    audienceCompany2 = '';
    audienceFile1 = '';
    audienceFile2 = '';
    await context.clearCookies();
    await context.grantPermissions([]);
    await page.waitForTimeout(CommonUtils.waitTimes.standard);
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - start').catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const failureReason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (failureReason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${failureReason.replace(/\n/g, '\n   ')}`);
      }
    }
    // Queue what the two imports created - read NOW, so asynchronously created Leads are included.
    const inv = new InvestmentPageMig(page);
    try {
      const created1 = await inv.findImportCreatedRecords(investmentId1, audienceEmail, audienceCompany1);
      created1.leadIds.forEach((id) => registerMigRecord('crm.lead', id, 'Lead created by import #1'));
      created1.partnerIds.forEach((id) => registerMigRecord('res.partner', id, 'Partner created by import #1', { deleteLast: true }));
      const created2 = await inv.findImportCreatedRecords(investmentId2, audienceEmail, audienceCompany2);
      created2.leadIds.forEach((id) => registerMigRecord('crm.lead', id, 'Lead created by import #2'));
      created2.partnerIds.forEach((id) => registerMigRecord('res.partner', id, 'Partner created by import #2', { deleteLast: true }));
    } catch (e: any) {
      console.log(`  [mig-cleanup] could not list the import-created records: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    // Evidence: the URL of every record this test created, printed before teardown removes (or keeps) them.
    await new InvestmentPageMig(page).logRecordUrls(TC, listMigCreatedRecords()).catch(() => {});
    // TEMPORARY - teardown paused when this TC fails, see InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE.
    if (InvestmentPageMig.keepFailedRunData(TC, testInfo)) {
      InvestmentPageMig.logKeptRunData(TC, listMigCreatedRecords(), [audienceFile1, audienceFile2]);
      resetMigCreatedRecords(); // kept records must not leak into the next test's teardown
    } else {
      await teardownMigRecords(page, false);
      for (const file of [audienceFile1, audienceFile2]) {
        if (file && fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`  deleted   file ${file}`);
        }
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepInvestmentsAfterAll(browser, TC);
  });

  test(`${TC}: Verify the value of "Investment" field from a Source Lead to Target Lead after importing new audience using csv file`, async ({ page }, testInfo) => {
    // Setup (~15 min budget) + the re-scan wait (MERGE_POLLS x mergeReverifyBudget) + the final reads (~15 min).
    test.setTimeout(config.timeouts.test * 2 + MERGE_POLLS * CommonUtils.waitTimes.mergeReverifyBudget);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const now = new Date();
    const currentDate = formatMDY(now);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const dateEndPlus6Months = formatMDY(sixMonthsLater);

    const timestamp = CommonUtils.generateTimestamp();
    const investmentName1 = `TEST ${TC} Investment ${timestamp}`;
    const investmentID1 = `TEST-Investment-${timestamp}`;
    const investmentName2 = `TEST ${TC} Investment 2 ${CommonUtils.generateTimestamp()}`;
    const investmentID2 = `TEST-Investment-2-${CommonUtils.generateTimestamp()}`;

    const loginPage = new LoginPageMig(page);
    const homePage = new HomePageMig(page);
    const investmentPage = new InvestmentPageMig(page);
    const opportunityPage = new OpportunityPage(page);

    let urlInvestment1 = '';
    let urlOpp1 = '';
    let csvData1 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;
    let csvData2 = {} as Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

    // ============================================================
    // PRE-CONDITION #1
    // ============================================================
    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      resetMigCreatedRecords();
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in');
    });

    await test.step(STEP.pre2, async () => {
      console.log(`\n--- ${STEP.pre2} ---`);
      await investmentPage.navigateToInvestment();
      console.log('  OK - Investments list is open');
    });

    await test.step(STEP.pre3, async () => {
      console.log(`\n--- ${STEP.pre3} ---`);
      await investmentPage.clickCreateButton();
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.pre4, async () => {
      console.log(`\n--- ${STEP.pre4} ---`);
      console.log(`  - Investment Name : ${investmentName1}`);
      console.log(`  - Investment ID   : ${investmentID1}`);
      await investmentPage.createBlankInvestment({
        investmentName: investmentName1,
        investmentID: investmentID1,
        ...INVESTMENT_DATA,
        dateStart: currentDate,
        dateEnd: currentDate,
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });
      investmentId1 = await investmentPage.findInvestmentIdByName(investmentName1);
      expect(investmentId1, `the Investment "${investmentName1}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(InvestmentPageMig.MODEL, investmentId1, 'Investment #1');
      InvestmentPageMig.logRecordUrl('Investment #1', InvestmentPageMig.MODEL, investmentId1);
      console.log(`  OK - Investment#1 saved (id ${investmentId1})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Investment#1 saved');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      csvData1 = await investmentPage.createImportAudienceFile({
        contactName: `TEST_SOURCE_name_${timestamp}`,
        tags: 'test',
        createManually: 'FALSE',
        investmentId: investmentID1,
        outputFileName: `CSV-Audience-${TC}-1.csv`,
      });
      audienceFile1 = csvData1.outputPath;
      audienceEmail = csvData1.emailContact1;
      audienceCompany1 = csvData1.companyName;
      expect(fs.existsSync(audienceFile1), `CSV-Audience-copy1 not found at: ${audienceFile1}`).toBeTruthy();
      console.log(`  - Name_Contact#1  : ${csvData1.contactName}`);
      console.log(`  - Email_Contact#1 : ${csvData1.emailContact1}`);
      console.log(`  - Company         : ${csvData1.companyName}`);
      console.log('  - Create manually : FALSE');
    });

    // ============================================================
    // STEPS TO REPRODUCE #1
    // ============================================================
    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.clickEditButton();
      console.log('  OK - Edit mode activated');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await investmentPage.clickAudienceTab();
      console.log('  OK - Audience tab clicked');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await investmentPage.uploadAudienceCSV(audienceFile1);
      console.log(`  OK - CSV-Audience-copy1 uploaded: ${audienceFile1}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await investmentPage.clickImportButton();
      console.log('  OK - Import completed');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await investmentPage.clickSaveButton();
      console.log('  OK - Save triggered');
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      urlInvestment1 = page.url();
      console.log(`  URL_Investment#1 : ${urlInvestment1}`);
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
    });

    // ============================================================
    // I. EDIT OPPORTUNITY
    // ============================================================
    await test.step(STEP.i1, async () => {
      console.log(`\n--- ${STEP.i1} ---`);
      await investmentPage.openCrmPipeline();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - CRM page open');
    });

    await test.step(STEP.i2, async () => {
      console.log(`\n--- ${STEP.i2} ---`);
      await opportunityPage.switchToListView();
      console.log('  OK - Switched to list view');
    });

    await test.step(STEP.i3, async () => {
      console.log(`\n--- ${STEP.i3} ---`);
      await opportunityPage.removeMyPipelineFilter();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log('  OK - "My Pipeline" filter removed');
    });

    await test.step(STEP.i4, async () => {
      console.log(`\n--- ${STEP.i4} ---`);
      await opportunityPage.searchByEmail(csvData1.emailContact1);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  OK - Searched for: ${csvData1.emailContact1}`);
    });

    await test.step(STEP.i5, async () => {
      console.log(`\n--- ${STEP.i5} ---`);
      await opportunityPage.clickOppRowByEmail(csvData1.emailContact1);
      console.log(`  OK - Clicked Opp row with email: ${csvData1.emailContact1}`);
    });

    await test.step(STEP.i6, async () => {
      console.log(`\n--- ${STEP.i6} ---`);
      await opportunityPage.clickEdit();
      console.log('  OK - Edit mode activated on Opp');
    });

    await test.step(STEP.i7, async () => {
      console.log(`\n--- ${STEP.i7} ---`);
      await opportunityPage.clickCRMDeveloperTab();
      console.log('  OK - CRM Developer tab opened');
      await opportunityPage.fillLeadForm('License');
      console.log('  OK - Lead form set to: License');
    });

    await test.step(STEP.i8, async () => {
      console.log(`\n--- ${STEP.i8} ---`);
      await opportunityPage.clickSave();
      console.log('  OK - Opp saved');
    });

    await test.step(STEP.i9, async () => {
      console.log(`\n--- ${STEP.i9} ---`);
      urlOpp1 = page.url();
      console.log(`  URL_Opp#1 : ${urlOpp1}`);
    });

    await test.step(STEP.i10, async () => {
      console.log(`\n--- ${STEP.i10} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
    });

    // ============================================================
    // PRE-CONDITION #2
    // ============================================================
    await test.step(STEP.p2a, async () => {
      console.log(`\n--- ${STEP.p2a} ---`);
      await investmentPage.navigateToInvestment();
      console.log('  OK - Investment page open');
    });

    await test.step(STEP.p2c, async () => {
      console.log(`\n--- ${STEP.p2c} ---`);
      await investmentPage.clickCreateButton();
      console.log('  OK - Create form opened');
    });

    await test.step(STEP.p2d, async () => {
      console.log(`\n--- ${STEP.p2d} ---`);
      console.log(`  - Investment Name : ${investmentName2}`);
      console.log(`  - Investment ID   : ${investmentID2}`);
      await investmentPage.createBlankInvestment({
        investmentName: investmentName2,
        investmentID: investmentID2,
        ...INVESTMENT_DATA,
        dateStart: currentDate,
        dateEnd: currentDate,
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });
      investmentId2 = await investmentPage.findInvestmentIdByName(investmentName2);
      expect(investmentId2, `the Investment "${investmentName2}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(InvestmentPageMig.MODEL, investmentId2, 'Investment #2');
      InvestmentPageMig.logRecordUrl('Investment #2', InvestmentPageMig.MODEL, investmentId2);
      console.log(`  OK - Investment#2 saved (id ${investmentId2})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 2 - Investment#2 saved');
    });

    await test.step(STEP.p2e, async () => {
      console.log(`\n--- ${STEP.p2e} ---`);
      csvData2 = await investmentPage.createImportAudienceFile({
        contactName: `TEST_TARGET_${CommonUtils.generateTimestamp()}`,
        email: csvData1.emailContact1,
        tags: 'Can_Merge',
        createManually: 'TRUE',
        investmentId: investmentID2,
        outputFileName: `CSV-Audience-${TC}-2.csv`,
      });
      audienceFile2 = csvData2.outputPath;
      audienceCompany2 = csvData2.companyName;
      expect(fs.existsSync(audienceFile2), `CSV-Audience-copy2 not found at: ${audienceFile2}`).toBeTruthy();
      console.log(`  - Name_Contact#2 : ${csvData2.contactName}`);
      console.log(`  - Email (reused) : ${csvData2.emailContact1}`);
      console.log(`  - Company        : ${csvData2.companyName}`);
      console.log('  - Tags           : Can_Merge');
      console.log('  - Create manually: TRUE');
    });

    // ============================================================
    // STEPS TO REPRODUCE #2
    // ============================================================
    await test.step(STEP.t1, async () => {
      console.log(`\n--- ${STEP.t1} ---`);
      await investmentPage.clickEditButton();
      console.log('  OK - Edit mode activated');
    });

    await test.step(STEP.t2, async () => {
      console.log(`\n--- ${STEP.t2} ---`);
      await investmentPage.clickAudienceTab();
      console.log('  OK - Audience tab clicked');
    });

    await test.step(STEP.t3, async () => {
      console.log(`\n--- ${STEP.t3} ---`);
      await investmentPage.uploadAudienceCSV(audienceFile2);
      console.log(`  OK - CSV-Audience-copy2 uploaded: ${audienceFile2}`);
    });

    await test.step(STEP.t4, async () => {
      console.log(`\n--- ${STEP.t4} ---`);
      await investmentPage.clickImportButton();
      console.log('  OK - Import completed');
    });

    await test.step(STEP.t5, async () => {
      console.log(`\n--- ${STEP.t5} ---`);
      await investmentPage.clickSaveButton();
      console.log('  OK - Save triggered');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #2 - Investment#2 saved after IMPORT');
    });

    await test.step(STEP.v1, async () => {
      console.log(`\n--- ${STEP.v1} ---`);
      await new LeadPage(page).waitForNoMergeConfirmation();
      await investmentPage.openCrmPipeline();
      const rows = await searchOpportunitiesByEmail(page, csvData1.emailContact1);
      const checks = [{ label: 'Opportunities for Email_Contact#1 in the default list (active only) - both Active', expected: 2, actual: rows }];
      const { allPass, lines } = printVerify(checks, 'the import did not merge the two Opportunities');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - right after the import`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(STEP.v2, async () => {
      console.log(`\n--- ${STEP.v2} ---`);
      const r = await waitForActiveOpportunityCount(page, csvData1.emailContact1, 1, MERGE_POLLS, () => investmentPage.openCrmPipeline());
      const checks = [{ label: `Active Opportunities for Email_Contact#1 after the re-scan (waited ${r.waitedMin} min, ${r.pollsUsed} polls)`, expected: 1, actual: r.rows }];
      const { allPass, lines } = printVerify(checks, 'the re-scan cron merged the two Opportunities');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - after the re-scan`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(STEP.v3, async () => {
      console.log(`\n--- ${STEP.v3} ---`);
      await investmentPage.openCrmPipeline();
      const allRows = await searchAllOpportunitiesByEmail(page, csvData1.emailContact1);
      await investmentPage.openCrmPipeline();
      const rows1 = await openFromAllLeadsByName(page, csvData1.contactName);
      const opp1 = await readMergeOutcome(page, { readInvestmentOnForm: true });
      logMergeOutcome('Opp of CSV-Audience-copy1 read on screen:', opp1);
      await investmentPage.openCrmPipeline();
      const rows2 = await openFromAllLeadsByName(page, csvData2.contactName);
      const opp2 = await readMergeOutcome(page, { readInvestmentOnForm: true });
      logMergeOutcome('Opp of CSV-Audience-copy2 read on screen:', opp2);
      // Each Opportunity is opened by its own name (unique per run) - never by the first row of an email search.
      const { checks: mergeChecks, survivor } = rescanMergeChecks(allRows, opp1, opp2, {
        investment1OnForm: `${investmentID1} - ${investmentName1}`,
        investment2OnForm: `${investmentID2} - ${investmentName2}`,
      });
      const checks = [
        { label: 'Opp of CSV-Audience-copy1 found by its name in Archive > All', expected: 1, actual: rows1 },
        { label: 'Opp of CSV-Audience-copy2 found by its name in Archive > All', expected: 1, actual: rows2 },
        ...mergeChecks,
      ];
      console.log(`  Observation (not scored) - surviving Opp : ${survivor.opportunity} (${survivor === opp1 ? 'CSV-Audience-copy1' : 'CSV-Audience-copy2'})`);
      const { allPass, lines } = printVerify(checks, 'merged by the re-scan, exactly 1 survivor, no Investment transferred');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - merge outcome`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });
  });
});

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * afterAll safety net (own admin session - afterAll gets no `page`): delete Investments still named
 * "TEST <tcId> ..." and the Leads linked to them. Bounded hook budget; never throws.
 */
async function sweepInvestmentsAfterAll(browser: Browser, tcId: string): Promise<void> {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const loginPage = new LoginPageMig(page);
    await loginPage.navigateTo(baseUrl_mig);
    await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
    await new InvestmentPageMig(page).sweepInvestmentLeftovers(tcId);
  } catch (err) {
    console.log(`[mig-sweep] SKIPPED - could not open a sweep session: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  } finally {
    await context.close().catch(() => {});
  }
}
