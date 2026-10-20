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

/**
 * ============================================================================================
 *  CRM-12370_8.8.1 - Investment is not transferred from a Source Lead to the Target Lead on merge
 *                    (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.8.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-3902_1.1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-3902_Investment_transfer_ban_on_merge/
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
 *  npx playwright test --grep "CRM-12370_8\.8\.1:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertions are copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; Investments navigation by XML-id URL hash
 *    (InvestmentPageMig); Home by HomePageMig.returnToHome; CRM by InvestmentPageMig.openCrmPipeline (verified on the "Pipeline" breadcrumb).
 *  - Investment names carry the run marker "TEST CRM-12370_8.8.1 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - Audience files: CSV-Audience-CRM-12370_8.8.1-1.csv and -2.csv (unique per TC).
 *  - Pre-condition 2 "Steps 1-2" (Home > Investments, then Investment) are folded into one
 *    navigation step: two adjacent purely navigational steps.
 *  - Clean-up: afterEach deletes, over RPC, both Investments, the Leads linked to them and the
 *    partners carrying this run's unique email / company names (deny-list); afterAll sweeps by name.
 *  - LeadPage / OpportunityPage are the pre-production page objects. Their Archive > All navigation,
 *    search, CRM Developer tab and merge-log readers have NO crm-mig variant yet (see report); they
 *    are called as written and may be RED for reasons unrelated to the import.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition #1:
 *    1. Login and navigate to the Investments module (Investments > Investment)
 *    2. Press "CREATE" button and wait
 *    3. Create a blank Investment (Name_Investment#1):
 *         - Investment Name             = TEST CRM-12370_8.8.1 Investment <datetime>
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

const TC = 'CRM-12370_8.8.1';

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
} as const;

/** Per-test state the afterEach needs. */
let investmentId1 = 0;
let investmentId2 = 0;
let audienceEmail = '';
let audienceCompany1 = '';
let audienceCompany2 = '';
let audienceFile1 = '';
let audienceFile2 = '';

/** Log-only VERIFY block: printed BEFORE the expect()s, so it shows on a FAIL too. */
function printVerifyBlock(rows: Array<{ check: string; expected: string; actual: string; pass: boolean }>): void {
  console.log('\n==================== VERIFY ====================');
  rows.forEach((r, i) => {
    console.log(`  Verify #${i + 1} - ${r.check}:`);
    console.log(`     Expected : ${r.expected}`);
    console.log(`     Actual   : ${r.actual}`);
    console.log(`     Result   : ${r.pass ? 'PASS' : 'FAIL'}`);
  });
  console.log('===============================================');
  console.log(`OVERALL: ${rows.every((r) => r.pass) ? 'PASS' : 'FAIL'}`);
}

test.describe(`${TC} - Investment is not transferred on merge (Source has link)`, () => {
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
    test.setTimeout(config.timeouts.test);
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
    const leadPage = new LeadPage(page);
    const opportunityPage = new OpportunityPage(page);

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
      console.log('  Waiting for Lead Merging to happen (polling chatter)...');
      const mergeHappened = await leadPage.waitForLeadMergingHappen_OnTargetLead(csvData2.contactName);
      expect(mergeHappened).toBeTruthy();
      console.log('  OK - Lead Merging confirmed via chatter log');
    });

    await test.step(STEP.ii6, async () => {
      console.log(`\n--- ${STEP.ii6} ---`);
      await test.step(STEP.ii61, async () => {
        console.log(`\n--- ${STEP.ii61} ---`);
        const tagsText = await opportunityPage.getTagsText();
        printVerifyBlock([{ check: '6.1 Tag field', expected: 'contains "Test"', actual: `"${tagsText}"`, pass: tagsText.includes('Test') }]);
        expect(tagsText).toContain('Test');
      });
      await test.step(STEP.ii62, async () => {
        console.log(`\n--- ${STEP.ii62} ---`);
        const companyName = await opportunityPage.getCompanyNameReadonly();
        printVerifyBlock([{ check: '6.2 Company Name', expected: `contains "${csvData1.companyName}"`, actual: `"${companyName}"`, pass: companyName.includes(csvData1.companyName) }]);
        expect(companyName).toContain(csvData1.companyName);
      });
      await test.step(STEP.ii63, async () => {
        console.log(`\n--- ${STEP.ii63} ---`);
        const addressText = await opportunityPage.getAddressReadonly();
        printVerifyBlock([{ check: '6.3 Country', expected: 'contains "China"', actual: `"${addressText}"`, pass: addressText.includes('China') }]);
        expect(addressText).toContain('China');
      });
      await test.step(STEP.ii64, async () => {
        console.log(`\n--- ${STEP.ii64} ---`);
        const salesTeam = await opportunityPage.getSalesTeamValue();
        printVerifyBlock([{ check: '6.4 Sales Team', expected: 'contains "CMR"', actual: `"${salesTeam}"`, pass: salesTeam.includes('CMR') }]);
        expect(salesTeam).toContain('CMR');
      });
      await test.step(STEP.ii65, async () => {
        console.log(`\n--- ${STEP.ii65} ---`);
        const email = await opportunityPage.getEmailReadonly();
        printVerifyBlock([{ check: '6.5 Email', expected: `contains "${csvData1.emailContact1}"`, actual: `"${email}"`, pass: email.includes(csvData1.emailContact1) }]);
        expect(email).toContain(csvData1.emailContact1);
      });
    });

    await test.step(STEP.ii7, async () => {
      console.log(`\n--- ${STEP.ii7} ---`);
      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await test.step(STEP.ii71, async () => {
        console.log(`\n--- ${STEP.ii71} ---`);
        const expectedLeadForm = `Investment: ID-${investmentId1OnURL}`;
        const leadForm = await opportunityPage.getLeadFormValue();
        printVerifyBlock([{ check: '7.1 Lead form', expected: `"${expectedLeadForm}"`, actual: `"${leadForm}"`, pass: leadForm === expectedLeadForm }]);
        expect(leadForm).toBe(expectedLeadForm);
      });
      await test.step(STEP.ii72, async () => {
        console.log(`\n--- ${STEP.ii72} ---`);
        const isActive = await opportunityPage.isActiveChecked();
        printVerifyBlock([{ check: '7.2 Active checkbox', expected: 'TRUE', actual: String(isActive).toUpperCase(), pass: isActive === true }]);
        expect(isActive).toBeTruthy();
      });
      await test.step(STEP.ii73, async () => {
        console.log(`\n--- ${STEP.ii73} ---`);
        const isWon = await opportunityPage.getIsWonValue();
        printVerifyBlock([{ check: '7.3 Is Won', expected: '"Pending"', actual: `"${isWon.trim()}"`, pass: isWon.trim() === 'Pending' }]);
        expect(isWon.trim()).toBe('Pending');
      });
      await test.step(STEP.ii74, async () => {
        console.log(`\n--- ${STEP.ii74} ---`);
        const lostReason = await opportunityPage.getLostReasonValueViaTextContent();
        printVerifyBlock([{ check: '7.4 Lost Reason', expected: 'BLANK (empty string)', actual: `"${lostReason}"`, pass: lostReason === '' }]);
        expect(lostReason).toBe('');
      });
    });

    await test.step(STEP.ii8, async () => {
      console.log(`\n--- ${STEP.ii8} ---`);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long);
      await test.step(STEP.ii81, async () => {
        console.log(`\n--- ${STEP.ii81} ---`);
        const hasMergeMessage = await opportunityPage.hasSourceLeadMergeMessage(csvData2.contactName);
        printVerifyBlock([{ check: '8.1 Log merge message (Opp 2)', expected: 'present', actual: hasMergeMessage ? 'present' : 'absent', pass: hasMergeMessage }]);
        expect(hasMergeMessage).toBeTruthy();
      });
    });

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
      const mergeHappened = await leadPage.waitForLeadMergingHappen(csvData1.contactName);
      expect(mergeHappened).toBeTruthy();
      console.log('  OK - Lead Merging confirmed via chatter log');
    });

    await test.step(STEP.iii6, async () => {
      console.log(`\n--- ${STEP.iii6} ---`);
      await test.step(STEP.iii61, async () => {
        console.log(`\n--- ${STEP.iii61} ---`);
        const tagsText = await opportunityPage.getTagsText();
        printVerifyBlock([{ check: '6.1 Tag field', expected: 'contains "Test"', actual: `"${tagsText}"`, pass: tagsText.includes('Test') }]);
        expect(tagsText).toContain('Test');
      });
      await test.step(STEP.iii62, async () => {
        console.log(`\n--- ${STEP.iii62} ---`);
        const companyName = await opportunityPage.getCompanyNameReadonly();
        printVerifyBlock([{ check: '6.2 Company Name', expected: `contains "${csvData2.companyName}"`, actual: `"${companyName}"`, pass: companyName.includes(csvData2.companyName) }]);
        expect(companyName).toContain(csvData2.companyName);
      });
      await test.step(STEP.iii63, async () => {
        console.log(`\n--- ${STEP.iii63} ---`);
        const addressText = await opportunityPage.getAddressReadonly();
        printVerifyBlock([{ check: '6.3 Country', expected: 'contains "China"', actual: `"${addressText}"`, pass: addressText.includes('China') }]);
        expect(addressText).toContain('China');
      });
      await test.step(STEP.iii64, async () => {
        console.log(`\n--- ${STEP.iii64} ---`);
        const salesTeam = await opportunityPage.getSalesTeamValue();
        printVerifyBlock([{ check: '6.4 Sales Team', expected: 'contains "CMR"', actual: `"${salesTeam}"`, pass: salesTeam.includes('CMR') }]);
        expect(salesTeam).toContain('CMR');
      });
      await test.step(STEP.iii65, async () => {
        console.log(`\n--- ${STEP.iii65} ---`);
        const email = await opportunityPage.getEmailReadonly();
        printVerifyBlock([{ check: '6.5 Email', expected: `contains "${csvData1.emailContact1}"`, actual: `"${email}"`, pass: email.includes(csvData1.emailContact1) }]);
        expect(email).toContain(csvData1.emailContact1);
      });
    });

    await test.step(STEP.iii7, async () => {
      console.log(`\n--- ${STEP.iii7} ---`);
      await opportunityPage.clickCRMDeveloperTab();
      await page.waitForTimeout(CommonUtils.waitTimes.standard);
      await test.step(STEP.iii71, async () => {
        console.log(`\n--- ${STEP.iii71} ---`);
        const expectedLeadForm = `Investment: ID-${investmentId2OnURL}`;
        const leadForm = await opportunityPage.getLeadFormValue();
        printVerifyBlock([{ check: '7.1 Lead form', expected: `"${expectedLeadForm}"`, actual: `"${leadForm}"`, pass: leadForm === expectedLeadForm }]);
        expect(leadForm).toBe(expectedLeadForm);
      });
      await test.step(STEP.iii72, async () => {
        console.log(`\n--- ${STEP.iii72} ---`);
        const isActive = await opportunityPage.isActiveChecked();
        printVerifyBlock([{ check: '7.2 Active checkbox', expected: 'FALSE', actual: String(isActive).toUpperCase(), pass: isActive === false }]);
        expect(isActive).toBeFalsy();
      });
      await test.step(STEP.iii73, async () => {
        console.log(`\n--- ${STEP.iii73} ---`);
        const isWon = await opportunityPage.getIsWonValue();
        printVerifyBlock([{ check: '7.3 Is Won', expected: '"Lost"', actual: `"${isWon.trim()}"`, pass: isWon.trim() === 'Lost' }]);
        expect(isWon.trim()).toBe('Lost');
      });
      await test.step(STEP.iii74, async () => {
        console.log(`\n--- ${STEP.iii74} ---`);
        const lostReason = await opportunityPage.getLostReasonValueViaTextContent();
        printVerifyBlock([{ check: '7.4 Lost Reason', expected: '"Duplicate"', actual: `"${lostReason}"`, pass: lostReason === 'Duplicate' }]);
        expect(lostReason).toBe('Duplicate');
      });
    });

    await test.step(STEP.iii8, async () => {
      console.log(`\n--- ${STEP.iii8} ---`);
      await homePage.waitForPageFullyLoaded(CommonUtils.waitTimes.long);
      await test.step(STEP.iii81, async () => {
        console.log(`\n--- ${STEP.iii81} ---`);
        const hasMergeMessage = await opportunityPage.hasTargetLeadMergeMessage(csvData1.contactName);
        printVerifyBlock([{ check: '8.1 Log merge message (Opp 1)', expected: 'present', actual: hasMergeMessage ? 'present' : 'absent', pass: hasMergeMessage }]);
        expect(hasMergeMessage).toBeTruthy();
      });
    });

    await test.step(STEP.iii9, async () => {
      console.log(`\n--- ${STEP.iii9} ---`);
      await homePage.returnToHome();
      console.log('  OK - Navigated back to Home page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Source Opp verified');
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
