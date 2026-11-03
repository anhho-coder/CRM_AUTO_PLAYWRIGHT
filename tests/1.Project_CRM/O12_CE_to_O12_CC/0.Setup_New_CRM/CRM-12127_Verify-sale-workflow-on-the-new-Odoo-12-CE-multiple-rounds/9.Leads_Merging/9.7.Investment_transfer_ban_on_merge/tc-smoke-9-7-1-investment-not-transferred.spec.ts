import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig, HomePageMig, OpportunityPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  teardownMigRecords,
  listMigCreatedRecords,
} from '@helpers/o12ce-main-business.helper';
import {
  pollForMergeOnMig, pollForMergeIntoTargetOnMig, verifyStep, MergeVerifyLog,
} from '@helpers/lead-merging-mig.helper';

/**
 * ============================================================================================
 *  CRM-12370_9.7.1 - Investment is not transferred from a Source Lead to the Target Lead on merge
 *                    (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_9.7.1
 *  Automation-Type : refactored
 *  Automation-Date : 2026-11-03
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-3902_1.1.1
 *  Source spec                : tests/1.Project_CRM/3.Lead_Merging/CRM-3902_Investment_transfer_ban_on_merge/
 *                               1.Target_Lead/1.1.Source_has_link/tc-crm-3902-1-1-1-investment-not-transferred.spec.ts
 *  Source version             : commit 0037150 (2026-06-15), working tree clean - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  KNOWN BLOCKER (2026-10-19)
 * --------------------------------------------------------------------------------------------
 *  Step 6 of Steps #1 (IMPORT of CSV-Audience-copy1) is refused by the crm-mig server, so this spec
 *  is RED by design until the server is fixed. Quoted error:
 *    IMPORT refused by the server (Odoo Server Error): AttributeError: 'bool' object has no attribute 'keys'
 *    nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, in _check_is_valid:
 *      pdDatas['isSalePerson'] = [not d or d and d in list(salespersons.keys()) ...]
 *  Everything after it (both imports, the merge verify points) is ported faithfully and is not
 *  reached until the import is fixed.
 *  2026-11-02 run (19:00 local): both IMPORTs completed - the blocker no longer reproduces. The run then
 *  failed at II. Step 5: the pre-production merge wait gave up after 6 attempts, while on crm-mig an
 *  import-created duplicate is merged only by the 20-min re-scan cron (CRM-12621).
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates two Investments, each with its own audience import: Investment#1 imports a TARGET
 *  contact, Investment#2 imports a SOURCE contact that reuses Email_Contact#1. Then checks the
 *  merged Target Lead (Opp 1) and the merged Source Lead (Opp 2): their fields, their CRM Developer
 *  tab (Lead form = Investment ID, Active, Is Won, Lost Reason) and the Log message - pre-production
 *  assertions unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_9.7.1:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertions are copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; Investments navigation by XML-id URL hash
 *    (InvestmentPageMig); Home by HomePageMig.returnToHome; CRM by InvestmentPageMig.openCrmPipeline (verified on the "Pipeline" breadcrumb).
 *  - Investment names carry the run marker "TEST CRM-12370_9.7.1 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - Audience files: CSV-Audience-CRM-12370_9.7.1-1.csv and -2.csv (unique per TC).
 *  - Pre-condition 2 "Steps 1-2" (Home > Investments, then Investment) are folded into one
 *    navigation step: two adjacent purely navigational steps.
 *  - Clean-up: afterEach deletes, over RPC, both Investments, the Leads linked to them and the
 *    partners carrying this run's unique email / company names (deny-list); afterAll sweeps by name.
 *  - Refactored 2026-11-03 to the section-9 standard (helpers/lead-merging-mig.helper.ts):
 *      - OpportunityPageMig (CRM Developer tab inside the crm-mig notebook "More" overflow);
 *      - II/III Step 5 poll the opened Opp for up to waitTimes.leadMergeMigWindow (35 min) instead of the
 *        pre-production 6-attempt wait - the merge itself is scored by Step 8.1, not by the wait;
 *      - Steps 6 / 7 / 8 run through verifyStep(): every point is read where shown, recorded Expected /
 *        Actual, soft-asserted, and each step takes ONE verify-point capture with every field it read
 *        outlined green (PASS) or red (FAIL); the final "Verification" step prints the VERIFY block.
 *    Expected values are unchanged from the baseline.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition #1:
 *    1. Login and navigate to the Investments module (Investments > Investment)
 *    2. Press "CREATE" button and wait
 *    3. Create a blank Investment (Name_Investment#1):
 *         - Investment Name             = TEST CRM-12370_9.7.1 Investment <datetime>
 *         - Investment ID               = TEST-Investment-<datetime>
 *         - Type                        = Webinar
 *         - Channel                     = Channel
 *         - Countries                   = Albania
 *         - Date start / Date end       = current date
 *         - Responsible - Sales         = Aleksey Galbur
 *         - Responsible - Marketing     = Nadiia Suprun
 *         - NBR Product List            = M365
 *         - Completion Events           = Atttended webinar
 *         - Conversion Events           = Downloaded free trial
 *         - Track conversion date start = current date
 *         - Track conversion date end   = current date + 6 months
 *    4. Create CSV-Audience-copy1 (TARGET contact, Create manually = FALSE):
 *         - Contact Name = TEST_TARGET_name_<timestamp>                 (Name_Contact#1)
 *         - Email        = Test@company<datetime>.com                    (Email_Contact#1)
 *         - Company      = TEST_company_name_<timestamp>                 (Name_Company_Contact#1)
 *         - Phone = 1234125125 | Country = China | Sales Team = CMR | Salesperson = Sergey Karachin
 *         - Tags = Test | Create manually = FALSE
 *  Steps to reproduce #1:
 *    1. On Investment page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 *    4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 *    5. Select CSV-Audience-copy1 file and wait
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *    8. Copy the current URL called URL_Investment#1
 *    9. Press "Application" button to back to Home page
 *  Pre-condition #2:
 *    1. On "Home" page, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment (Name_Investment#2): Investment Name = TEST Investment 2 <datetime>, other fields as Investment#1
 *    5. Create CSV-Audience-copy2 (SOURCE contact):
 *         - Contact Name = TEST_SOURCE + <datetime>                     (Name_Contact#2)
 *         - Email        = use Email_Contact#1
 *         - Company      = TEST_company_name + <datetime>               (Name_Company_Contact#2)
 *         - Phone, Country, Sales Team, Salesperson as copy1 | Tags = Test | Create manually = FALSE
 *  Steps to reproduce #2:
 *    1. On Investment page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 *    4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 *    5. Select CSV-Audience-copy2 file and wait
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *    8. Copy the current URL called URL_Investment#2
 *    9. Press "Application" button to back to Home page
 *  II. Verify point - Target Opp:
 *    1. Click at "CRM" button and wait for Lead Merging
 *    2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item
 *    3. The "All Leads" page appears
 *    4. On "Search" textbox, enter value of Email_Contact#1 then enter to start to search
 *    5. On "Opp" page, click at the line of "Opportunity" = value of "Name_Contact#1" and wait
 *    6. Verify the following:
 *       6.1. Tag field contains 1 value: "Test"
 *       6.2. Company Name textbox = Name_Company_Contact#1
 *       6.3. Country dropdown list = China
 *       6.4. Sales Team dropdown list = CMR
 *       6.5. Email textbox = Email_Contact#1 that created previously
 *    7. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *       7.1. Lead form textbox = "Investment: ID-[InvestmentID]" where [InvestmentID] is the number in ID of URL_Investment#1
 *       7.2. Active checkbox = TRUE
 *       7.3. Is Won = Pending
 *       7.4. Lost Reason = BLANK
 *    8. On the Log area, verify the following:
 *       8.1. There is the text as "[Opp 2], has been merged into this lead." where [Opp 2] is Name_Contact#2
 *    9. Press "Application" button to back to Home page
 *  III. Verify point - Source Opp:
 *    1. Click at "CRM" button
 *    2. On "CRM" page, on menu on top of page, select "Archive" item then "All" sub-item
 *    3. The "All Leads" page appears
 *    4. On "Search" textbox, enter value of Email_Contact#2 then enter to start to search
 *    5. On "Opp" page, click at the line of "Opportunity" = value of "Name_Contact#2" and wait
 *    6. Verify the following:
 *       6.1. Tag field contains 1 value: "Test"
 *       6.2. Company Name textbox = Name_Company_Contact#2
 *       6.3. Country dropdown list = China
 *       6.4. Sales Team dropdown list = CMR
 *       6.5. Email textbox = Email_Contact#1 that created previously
 *    7. Click at "CRM Developer" tab at the bottom of page and verify the following:
 *       7.1. Lead form textbox = "Investment: ID-[InvestmentID]" where [InvestmentID] is the number in ID of URL_Investment#2
 *       7.2. Active checkbox = FALSE
 *       7.3. Is Won = Lost
 *       7.4. Lost Reason = Duplicate
 *    8. On the Log area, verify the following:
 *       8.1. There is the text as "This lead has been merged into [Opp 1]." where [Opp 1] is the Opp Name of Name_Contact#1
 *    9. Press "Application" button to back to Home page
 *  Tear down:
 *    1. Delete Investment#1 and Investment#2 (and, on crm-mig, the Leads / partners the imports created)
 *    2. Delete CSV-Audience-copy1 and CSV-Audience-copy2
 * ============================================================================================
 */

const TC = 'CRM-12370_9.7.1';

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
  pre5: 'Pre-condition 5: Create CSV-Audience-copy1 (TARGET contact, Create manually = FALSE)',
  s1: 'Steps #1 - Step 1: Press "EDIT" button on Investment#1',
  s2: 'Steps #1 - Step 2: Click "Audience" tab',
  s3: 'Steps #1 - Step 3-5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy1',
  s4: 'Steps #1 - Step 6: Press "IMPORT" button and wait',
  s5: 'Steps #1 - Step 7: Press "SAVE" button on Investment page',
  s6: 'Steps #1 - Step 8: Copy current URL as URL_Investment#1',
  s7: 'Steps #1 - Step 9: Press "Application" button to back to Home page',
  p2a: 'Pre-condition 2 Steps 1-2: Click "Investments" on Home page, then select "Investment"',
  p2c: 'Pre-condition 2 Step 3: Press "CREATE" button and wait',
  p2d: 'Pre-condition 2 Step 4: Create a blank Investment#2 (Name_Investment#2)',
  p2e: 'Pre-condition 2 Step 5: Create CSV-Audience-copy2 (SOURCE contact, reuses Email_Contact#1)',
  t1: 'Steps #2 - Step 1: Press "EDIT" button on Investment#2',
  t2: 'Steps #2 - Step 2: Click "Audience" tab',
  t3: 'Steps #2 - Step 3-5: Click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy2',
  t4: 'Steps #2 - Step 6: Press "IMPORT" button and wait',
  t5: 'Steps #2 - Step 7: Press "SAVE" button on Investment page',
  t6: 'Steps #2 - Step 8: Copy current URL as URL_Investment#2',
  t7: 'Steps #2 - Step 9: Press "Application" button to back to Home page',
  ii1: 'II. Target Opp - Step 1: Click "CRM" button and wait for Lead Merging',
  ii2: 'II. Target Opp - Step 2: On "CRM" page, select "Archive" then "All" sub-item',
  ii3: 'II. Target Opp - Step 3: Verify the "All Leads" page appears',
  ii4: 'II. Target Opp - Step 4: Search for Email_Contact#1 in Search textbox',
  ii5: 'II. Target Opp - Step 5: Click the Opp row where Opportunity = Name_Contact#1 and wait for Lead Merging',
  ii6: 'II. Target Opp - Step 6: Verify fields on Target Opp',
  ii61: 'Step 6.1: Tag field contains "Test"',
  ii62: 'Step 6.2: Company Name textbox = Name_Company_Contact#1',
  ii63: 'Step 6.3: Country dropdown list = China',
  ii64: 'Step 6.4: Sales Team dropdown list = CMR',
  ii65: 'Step 6.5: Email textbox = Email_Contact#1',
  ii7: 'II. Target Opp - Step 7: Click "CRM Developer" tab and verify fields',
  ii71: 'Step 7.1: Lead form textbox = "Investment: ID-<Investment#1 id from URL_Investment#1>"',
  ii72: 'Step 7.2: Active checkbox = TRUE',
  ii73: 'Step 7.3: Is Won = Pending',
  ii74: 'Step 7.4: Lost Reason = BLANK',
  ii8: 'II. Target Opp - Step 8: Verify Log area',
  ii81: 'Step 8.1: Log contains "[Opp 2], has been merged into this lead."',
  ii9: 'II. Target Opp - Step 9: Press "Application" button to back to Home page',
  iii1: 'III. Source Opp - Step 1: Click "CRM" button',
  iii2: 'III. Source Opp - Step 2: On "CRM" page, select "Archive" then "All" sub-item',
  iii3: 'III. Source Opp - Step 3: Verify the "All Leads" page appears',
  iii4: 'III. Source Opp - Step 4: Search for Email_Contact#2 in Search textbox',
  iii5: 'III. Source Opp - Step 5: Click the Opp row where Opportunity = Name_Contact#2 and wait for Lead Merging',
  iii6: 'III. Source Opp - Step 6: Verify fields on Source Opp',
  iii61: 'Step 6.1: Tag field contains "Test"',
  iii62: 'Step 6.2: Company Name textbox = Name_Company_Contact#2',
  iii63: 'Step 6.3: Country dropdown list = China',
  iii64: 'Step 6.4: Sales Team dropdown list = CMR',
  iii65: 'Step 6.5: Email textbox = Email_Contact#1',
  iii7: 'III. Source Opp - Step 7: Click "CRM Developer" tab and verify fields',
  iii71: 'Step 7.1: Lead form textbox = "Investment: ID-<Investment#2 id from URL_Investment#2>"',
  iii72: 'Step 7.2: Active checkbox = FALSE',
  iii73: 'Step 7.3: Is Won = Lost',
  iii74: 'Step 7.4: Lost Reason = Duplicate',
  iii8: 'III. Source Opp - Step 8: Verify Log area',
  iii81: 'Step 8.1: Log contains "This lead has been merged into [Opp 1]."',
  iii9: 'III. Source Opp - Step 9: Press "Application" button to back to Home page',
  verify: 'Verification',
} as const;

/** Per-test state the afterEach needs. */
let investmentId1 = 0;
let investmentId2 = 0;
let audienceEmail = '';
let audienceCompany1 = '';
let audienceCompany2 = '';
let audienceFile1 = '';
let audienceFile2 = '';

test.describe(`${TC} - Verify value of Investment field from Source Lead NOT to Target Lead after importing`, () => {
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

  test(`${TC}: Verify value of Investment field from Source Lead NOT to Target Lead after importing`, async ({ page }, testInfo) => {
    // Setup (two Investments + two imports, ~15 min) + the 35-min merge window + the verify points.
    test.setTimeout(config.timeouts.test + CommonUtils.waitTimes.leadMergeMigTest);
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
    const opportunityPage = new OpportunityPageMig(page);
    const vlog = new MergeVerifyLog();

    let urlInvestment1 = '';
    let urlInvestment2 = '';
    let investmentId1OnURL = '';
    let investmentId2OnURL = '';
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
      console.log(`  - Investment Name             : ${investmentName1}`);
      console.log(`  - Investment ID               : ${investmentID1}`);
      console.log(`  - Completion Events           : ${INVESTMENT_DATA.completionEvents}`);
      console.log(`  - Conversion Events           : ${INVESTMENT_DATA.conversionEvents}`);
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
        contactName: `TEST_TARGET_name_${timestamp}`,
        company: `TEST_company_name_${timestamp}`,
        tags: 'Test',
        createManually: 'FALSE',
        investmentId: investmentID1,
        outputFileName: `CSV-Audience-${TC}-1.csv`,
      });
      audienceFile1 = csvData1.outputPath;
      audienceEmail = csvData1.emailContact1;
      audienceCompany1 = csvData1.companyName;
      expect(fs.existsSync(audienceFile1), `CSV-Audience-copy1 not found at: ${audienceFile1}`).toBeTruthy();
      console.log(`  - Name_Contact#1    : ${csvData1.contactName}`);
      console.log(`  - Email_Contact#1   : ${csvData1.emailContact1}  (will be reused in copy2)`);
      console.log(`  - Company           : ${csvData1.companyName}`);
      console.log('  - Create manually   : FALSE');
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
      const match = urlInvestment1.match(/[?&#]id=(\d+)/);
      investmentId1OnURL = match ? match[1] : '';
      console.log(`  URL_Investment#1  : ${urlInvestment1}`);
      console.log(`  Investment ID#1   : ${investmentId1OnURL}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce #1 - Investment#1 saved');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
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
      const timestamp2 = CommonUtils.generateTimestamp();
      csvData2 = await investmentPage.createImportAudienceFile({
        contactName: `TEST_SOURCE_${timestamp2}`,
        company: `TEST_company_name_${timestamp2}`,
        email: csvData1.emailContact1,
        tags: 'Test',
        createManually: 'FALSE',
        investmentId: investmentID2,
        outputFileName: `CSV-Audience-${TC}-2.csv`,
      });
      audienceFile2 = csvData2.outputPath;
      audienceCompany2 = csvData2.companyName;
      expect(fs.existsSync(audienceFile2), `CSV-Audience-copy2 not found at: ${audienceFile2}`).toBeTruthy();
      console.log(`  - Name_Contact#2 : ${csvData2.contactName}`);
      console.log(`  - Email (reused) : ${csvData2.emailContact1}`);
      console.log(`  - Company#2      : ${csvData2.companyName}`);
      console.log('  - Tags           : Test');
      console.log('  - Create manually: FALSE');
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
    });

    await test.step(STEP.t6, async () => {
      console.log(`\n--- ${STEP.t6} ---`);
      urlInvestment2 = page.url();
      const match = urlInvestment2.match(/[?&#]id=(\d+)/);
      investmentId2OnURL = match ? match[1] : '';
      console.log(`  URL_Investment#2  : ${urlInvestment2}`);
      console.log(`  Investment ID#2   : ${investmentId2OnURL}`);
    });

    await test.step(STEP.t7, async () => {
      console.log(`\n--- ${STEP.t7} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
    });

    // ============================================================
    // II. VERIFY POINT - TARGET OPP
    // ============================================================
    await test.step(STEP.ii1, async () => {
      console.log(`\n--- ${STEP.ii1} ---`);
      await investmentPage.openCrmPipeline();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - CRM page open');
    });

    await test.step(STEP.ii2, async () => {
      console.log(`\n--- ${STEP.ii2} ---`);
      await opportunityPage.navigateToAllLeads();
      console.log('  OK - Archive > All Leads open');
    });

    await test.step(STEP.ii3, async () => {
      console.log(`\n--- ${STEP.ii3} ---`);
      console.log('  OK - All Leads page is displayed (confirmed by the navigation step above)');
    });

    await test.step(STEP.ii4, async () => {
      console.log(`\n--- ${STEP.ii4} ---`);
      await opportunityPage.searchByEmail(csvData1.emailContact1);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  OK - Searched for: ${csvData1.emailContact1}`);
    });

    await test.step(STEP.ii5, async () => {
      console.log(`\n--- ${STEP.ii5} ---`);
      await opportunityPage.clickOppRowByOppName(csvData1.contactName);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  OK - Clicked Opp row: ${csvData1.contactName}`);
      // Wait only - the merge is scored by Step 8.1 (its own verify-point capture), never by this wait.
      await pollForMergeIntoTargetOnMig(page, opportunityPage, { url: page.url(), name: csvData1.contactName }, csvData2.contactName);
    });

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.ii6, [
      { label: STEP.ii61, kind: 'tags', expected: ['Test'] },
      { label: STEP.ii62, kind: 'company', expected: csvData1.companyName },
      { label: STEP.ii63, kind: 'address', expected: 'China' },
      { label: STEP.ii64, kind: 'salesTeam', expected: 'CMR' },
      { label: STEP.ii65, kind: 'email', expected: csvData1.emailContact1 },
    ]);

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.ii7, [
      { label: STEP.ii71, kind: 'leadFormBe', expected: `Investment: ID-${investmentId1OnURL}`, meaning: 'another ID would mean an Investment was transferred' },
      { label: STEP.ii72, kind: 'activeTrue', meaning: 'FALSE would mean the Target Opp itself was archived' },
      { label: STEP.ii73, kind: 'isWon', expected: 'Pending' },
      { label: STEP.ii74, kind: 'lostReason', expected: '' },
    ], () => opportunityPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.ii8, [
      { label: STEP.ii81, kind: 'sourceMergeMsg', expected: csvData2.contactName, meaning: 'NOT FOUND means Opp 2 was not merged into Opp 1' },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long));

    await test.step(STEP.ii9, async () => {
      console.log(`\n--- ${STEP.ii9} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
    });

    // ============================================================
    // III. VERIFY POINT - SOURCE OPP
    // ============================================================
    await test.step(STEP.iii1, async () => {
      console.log(`\n--- ${STEP.iii1} ---`);
      await investmentPage.openCrmPipeline();
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - CRM page open');
    });

    await test.step(STEP.iii2, async () => {
      console.log(`\n--- ${STEP.iii2} ---`);
      await opportunityPage.navigateToAllLeads();
      console.log('  OK - Archive > All Leads open');
    });

    await test.step(STEP.iii3, async () => {
      console.log(`\n--- ${STEP.iii3} ---`);
      console.log('  OK - All Leads page is displayed (confirmed by the navigation step above)');
    });

    await test.step(STEP.iii4, async () => {
      console.log(`\n--- ${STEP.iii4} ---`);
      await opportunityPage.searchByEmail(csvData2.emailContact1);
      console.log(`  OK - Searched for: ${csvData2.emailContact1}`);
    });

    await test.step(STEP.iii5, async () => {
      console.log(`\n--- ${STEP.iii5} ---`);
      await opportunityPage.clickOppRowByOppName(csvData2.contactName);
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      console.log(`  OK - Clicked Opp row: ${csvData2.contactName}`);
      // Wait only (returns at once when part II already saw the merge) - Step 8.1 scores it.
      await pollForMergeOnMig(page, opportunityPage, { url: page.url(), name: csvData2.contactName }, csvData1.contactName);
    });

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.iii6, [
      { label: STEP.iii61, kind: 'tags', expected: ['Test'] },
      { label: STEP.iii62, kind: 'company', expected: csvData2.companyName },
      { label: STEP.iii63, kind: 'address', expected: 'China' },
      { label: STEP.iii64, kind: 'salesTeam', expected: 'CMR' },
      { label: STEP.iii65, kind: 'email', expected: csvData1.emailContact1 },
    ]);

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.iii7, [
      { label: STEP.iii71, kind: 'leadFormBe', expected: `Investment: ID-${investmentId2OnURL}`, meaning: 'another ID would mean an Investment was transferred' },
      { label: STEP.iii72, kind: 'activeFalse', meaning: 'TRUE would mean the Source Opp was not archived by a merge' },
      { label: STEP.iii73, kind: 'isWon', expected: 'Lost' },
      { label: STEP.iii74, kind: 'lostReason', expected: 'Duplicate' },
    ], () => opportunityPage.clickCRMDeveloperTab());

    await verifyStep(page, testInfo, vlog, opportunityPage, STEP.iii8, [
      { label: STEP.iii81, kind: 'targetMergeMsg', expected: csvData1.contactName, meaning: 'NOT FOUND means Opp 2 was not merged into Opp 1' },
    ], () => homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long));

    await test.step(STEP.iii9, async () => {
      console.log(`\n--- ${STEP.iii9} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Source Opp verified');
    });

    await test.step(STEP.verify, async () => {
      console.log(`\n--- ${STEP.verify} ---`);
      vlog.print('Opp 2 merged into Opp 1 - each Opp keeps its own Investment (Lead form), fields and both log notes as in the baseline');
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
