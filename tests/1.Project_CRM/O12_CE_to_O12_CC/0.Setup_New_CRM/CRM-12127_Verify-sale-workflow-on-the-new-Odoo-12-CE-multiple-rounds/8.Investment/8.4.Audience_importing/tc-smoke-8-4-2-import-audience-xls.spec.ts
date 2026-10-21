import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig } from '@pages/mig';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  teardownMigRecords,
  listMigCreatedRecords,
} from '@helpers/o12ce-main-business.helper';
import {
  searchOpportunitiesByEmail,
  readOpportunity,
  logOpportunity,
  readImportedContacts,
  logContact,
  importedOpportunityChecks,
  importedContactsChecks,
  printVerify,
} from '@helpers/investment-import-verify.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.4.2 - Import a new audience from an XLS file (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.4.2
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Jira (this TC)             : CRM-13683 (Xray Manual Steps, 7 steps; the Expected Result sits on step 7,
 *                               written 2026-10-21 - a step edit does not move `updated`, so diff the step text)
 *  Source TC (pre-production) : CRM-2482_3.1.1.1.2 (Jira CRM-9796, updated 2026-10-21T10:28+0300 - re-check before trusting this spec)
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/
 *                               3.Audience_importing/3.1.Import_from_file/3.1.1.Import_a_new_audience/
 *                               tc-crm-2482-3-1-1-1-2-Verify-import-audiences-xls-file.spec.ts
 *  Expected Result            : pre-production baseline measured 2026-10-21 (Opportunity #1101505, Contacts #716469/#716470),
 *                               master 'Migration - Setup New CRM' J385
 *
 * --------------------------------------------------------------------------------------------
 *  BLOCKER RESOLVED (CRM-13640, fixed 2026-10-19, PASSED 2026-10-20)
 * --------------------------------------------------------------------------------------------
 *  Step 6 (IMPORT) was refused by crm-mig with
 *    IMPORT refused by the server (Odoo Server Error): AttributeError: module 'time' has no attribute 'clock'
 *  Filed on CRM-13640; fixed there. The XLS stays attached to the report in Pre-condition 5.
 *  TEARDOWN_PAUSED is back to false (2026-10-20): a passing run deletes its records and the file; a
 *  failing run still keeps them while the TC is on InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE.
 *  The import runs in the background, so afterEach waits for its Lead before listing what to delete.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, imports a generated XLS audience file and saves the Investment, then
 *  verifies on screen the ONE new Opportunity (sheet + CRM Developer tab) and the TWO new Contacts
 *  (company + individual) the import produced, against the pre-production baseline.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.4\.2:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertions are copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; navigation by XML-id URL hash (InvestmentPageMig).
 *  - Investment Name carries the run marker "TEST CRM-12370_8.4.2 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - createImportAudienceXLSFile() has no file-name option and writes XLS-Audience-copy1.xls; the
 *    generated file is renamed at once to XLS-Audience-CRM-12370_8.4.2.xls (same folder) and that
 *    path is used everywhere. The file is deleted in afterEach - TEMPORARILY kept (see KNOWN BLOCKER).
 *  - Investment ID = test (Pre-condition 5.1) is now written into the XLS (2026-10-20). The generator
 *    had no option for it and left the cell blank, so crm-mig answered `Lines [2] "Investment ID" is
 *    empty` once CRM-13640 fixed the .xls reader (Khang Nguyen, CRM-13640, 2026-10-19).
 *  - Tear-down steps of the source (Delete Investment, Delete XLS) are replaced by the afterEach
 *    ledger teardown (RPC, deny-list) and the file removal, per the crm-mig convention.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment with the following fields:
 *         - Investment Name             = TEST CRM-12370_8.4.2 Investment <datetime>
 *         - Investment ID               = TEST-Investment-<datetime>
 *         - Type                        = Webinar
 *         - Channel                     = Channel
 *         - Countries                   = Albania
 *         - Date start                  = current date
 *         - Date end                    = current date
 *         - Responsible - Sales         = Aleksey Galbur
 *         - Responsible - Marketing     = Nadiia Suprun
 *         - NBR Product List            = M365
 *         - Completion Events           = Atttended webinar
 *         - Conversion Events           = Downloaded free trial
 *         - Track conversion date start = current date
 *         - Track conversion date end   = current date + 6 months
 *    5. Create an Import Audience XLS file:
 *       5.1. Generate test data:
 *            - Contact Name  = TEST_first_name-TEST_last_name_<timestamp>   (Name_Contact#1)
 *            - Email         = Test@company<YYYY>-<MM>-<DD><HHMMSS>.com     (Email_Contact#1)
 *            - Company       = TEST_company_name_<timestamp>                (Company_Contact#1)
 *            - Phone         = 1234125125
 *            - Country       = China
 *            - Sales Team    = CMR
 *            - Salesperson   = Sergey Karachin
 *            - Tags          = test
 *            - Investment ID = test
 *       5.2. Use template XLS file: XLS-AudienceTemplate-1.xls
 *       5.3. Create XLS-Audience-copy1.xls and fill test data into respective columns
 *       5.4. Save the file to test-data/investment-module/XLS-Audience-copy1.xls
 *  Steps to reproduce:
 *    1. On Investment page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 *    4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 *    5. Select XLS-Audience-copy1 file and wait
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *  Expected Result (step 7):
 *    After Step 7, within 15 s (the import runs through the queue):
 *    1. CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 1 Opportunity:
 *       1.1. Opportunity  = Name_Contact#1
 *            Stage        = New
 *       1.2. Company Name = Company_Contact#1
 *            Contact Name = Name_Contact#1
 *       1.3. Company      = Company_Contact#1
 *            Contact      = "Company_Contact#1, Name_Contact#1"
 *       1.4. Email        = Email_Contact#1
 *            Phone        = 1234125125
 *            Country      = China
 *       1.5. Sales Team   = CMR
 *            Salesperson  = Sergey Karachin
 *       1.6. Tags contains exactly 1 value: "test"
 *       1.7. Investment   = "<Investment ID> - <Investment Name>" of this Investment
 *            (the file's "Investment ID" cell = "test"; the Opportunity is still linked to this Investment)
 *       1.8. CRM Developer tab: Lead form = "Investment: ID-<n>" (<n> = id in the URL of this Investment)
 *                               Active    = TRUE
 *    2. Contacts, search Email_Contact#1 -> exactly 2 new contacts:
 *       2.1. Company_Contact#1: Is a Company = TRUE (the "Companies" filter keeps exactly this row)
 *                               Email        = Email_Contact#1
 *                               Phone        = 1234125125
 *                               Country      = China
 *                               Sales Team   = CMR
 *                               Salesperson  = Sergey Karachin
 *                               Tags         = "test"
 *       2.2. Name_Contact#1:    Related Company = Company_Contact#1
 *                               Email, Phone, Country, Sales Team, Salesperson as 2.1
 *  Verification 1 and 2 below read these on screen. Email_Contact#1 is unique to the run (timestamped),
 *  so the "exactly 1 / exactly 2" counts start from a baseline of 0 by construction.
 * ============================================================================================
 */

const TC = 'CRM-12370_8.4.2';

/** Teardown switch - false since 2026-10-20 (CRM-13640 fixed). true keeps every record + the file, pass or fail. */
const TEARDOWN_PAUSED = false;

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
  pre4: 'Pre-condition 4: Create a blank Investment',
  pre5: 'Pre-condition 5: Create an Import Audience XLS file (XLS-Audience-CRM-12370_8.4.2.xls)',
  s1: 'Step 1: On Investment page, press "EDIT" button and wait',
  s2: 'Step 2: Click at "Audience" tab',
  s3: 'Step 3-5: On "Audience" section, click "UPLOAD YOUR FILE", navigate to folder and select the XLS file',
  s4: 'Step 6: Press "IMPORT" button and wait',
  s5: 'Step 7: Press "SAVE" button on Investment page',
  v1: 'Verification 1: CRM > list view, remove "My Pipeline", search Email_Contact#1 -> exactly 1 Opportunity; open it and read the sheet and the CRM Developer tab',
  v2: 'Verification 2: Contacts, search Email_Contact#1 -> exactly 2 new contacts; "Companies" filter -> Company_Contact#1; open each contact',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;
let audienceEmail = '';
let audienceCompany = '';
let audienceFile = '';

test.describe(`${TC} - Import a new audience from XLS`, () => {
  test.beforeEach(async ({ context, page }) => {
    investmentId = 0;
    audienceEmail = '';
    audienceCompany = '';
    audienceFile = '';
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
    // Queue what the import created - read NOW, so asynchronously created Leads are included.
    try {
      // A passed run means the import was accepted: wait up to 30 s for its queued Lead / partners.
      const created = await new InvestmentPageMig(page).findImportCreatedRecords(
        investmentId, audienceEmail, audienceCompany, testInfo.status === 'passed' ? 30_000 : 0);
      created.leadIds.forEach((id) => registerMigRecord('crm.lead', id, 'Lead created by the audience import'));
      created.partnerIds.forEach((id) => registerMigRecord('res.partner', id, 'Partner created by the audience import', { deleteLast: true }));
    } catch (e: any) {
      console.log(`  [mig-cleanup] could not list the import-created records: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    // Evidence: the URL of every record this test created, printed before teardown removes (or keeps) them.
    await new InvestmentPageMig(page).logRecordUrls(TC, listMigCreatedRecords()).catch(() => {});
    // TEMPORARY - teardown OFF for this TC (TEARDOWN_PAUSED), records + import file kept, pass or fail.
    if (TEARDOWN_PAUSED) {
      InvestmentPageMig.logKeptRunData(TC, listMigCreatedRecords(), [audienceFile], `teardown paused - test ${testInfo.status}`);
      resetMigCreatedRecords(); // kept records must not leak into the next test's teardown
    } else if (InvestmentPageMig.keepFailedRunData(TC, testInfo)) {
      InvestmentPageMig.logKeptRunData(TC, listMigCreatedRecords(), [audienceFile]);
      resetMigCreatedRecords(); // kept records must not leak into the next test's teardown
    } else {
      await teardownMigRecords(page, false);
      if (audienceFile && fs.existsSync(audienceFile)) {
        fs.unlinkSync(audienceFile);
        console.log(`  deleted   file ${audienceFile}`);
      }
    }
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'afterEach - teardown done').catch(() => {});
  });

  test.afterAll(async ({ browser }) => {
    await sweepInvestmentsAfterAll(browser, TC);
  });

  test(`${TC}: Verify new contact/Opp created after importing new audience using xls file`, async ({ page }, testInfo) => {
    test.setTimeout(config.timeouts.test);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const now = new Date();
    const currentDate = formatMDY(now);
    const sixMonthsLater = new Date(now);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    const dateEndPlus6Months = formatMDY(sixMonthsLater);
    const investmentName = `TEST ${TC} Investment ${CommonUtils.generateTimestamp()}`;
    const investmentID = `TEST-Investment-${CommonUtils.generateTimestamp()}`;

    const loginPage = new LoginPageMig(page);
    const investmentPage = new InvestmentPageMig(page);
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceXLSFile>>;

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
      console.log(`  - Investment Name             : ${investmentName}`);
      console.log(`  - Investment ID               : ${investmentID}`);
      console.log(`  - Type                        : ${INVESTMENT_DATA.type}`);
      console.log(`  - Channel                     : ${INVESTMENT_DATA.channel}`);
      console.log(`  - Countries                   : ${INVESTMENT_DATA.countries}`);
      console.log(`  - Date start                  : ${currentDate}`);
      console.log(`  - Date end                    : ${currentDate}`);
      console.log(`  - Responsible - Sales         : ${INVESTMENT_DATA.responsibleSales}`);
      console.log(`  - Responsible - Marketing     : ${INVESTMENT_DATA.responsibleMarketing}`);
      console.log(`  - NBR Product List            : ${INVESTMENT_DATA.nbrProductList}`);
      console.log(`  - Completion Events           : ${INVESTMENT_DATA.completionEvents}`);
      console.log(`  - Conversion Events           : ${INVESTMENT_DATA.conversionEvents}`);
      console.log(`  - Track conversion date start : ${currentDate}`);
      console.log(`  - Track conversion date end   : ${dateEndPlus6Months}`);
      await investmentPage.createBlankInvestment({
        investmentName,
        investmentID,
        ...INVESTMENT_DATA,
        dateStart: currentDate,
        dateEnd: currentDate,
        trackConversionDateStart: currentDate,
        trackConversionDateEnd: dateEndPlus6Months,
      });
      investmentId = await investmentPage.findInvestmentIdByName(investmentName);
      expect(investmentId, `the Investment "${investmentName}" must exist after SAVE`).toBeGreaterThan(0);
      registerMigRecord(InvestmentPageMig.MODEL, investmentId, 'Investment');
      InvestmentPageMig.logRecordUrl('Investment', InvestmentPageMig.MODEL, investmentId);
      console.log(`  OK - Investment saved (id ${investmentId})`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition 4 - Investment saved');
    });

    await test.step(STEP.pre5, async () => {
      console.log(`\n--- ${STEP.pre5} ---`);
      // The generator writes XLS-Audience-copy1.xls with no name option: rename it at once to a TC-unique name.
      const generated = await investmentPage.createImportAudienceXLSFile({ investmentId: 'test' });
      const uniquePath = path.join(path.dirname(generated.outputPath), `XLS-Audience-${TC}.xls`);
      fs.renameSync(generated.outputPath, uniquePath);
      audienceData = { ...generated, outputPath: uniquePath };
      audienceFile = audienceData.outputPath;
      audienceEmail = audienceData.emailContact1;
      audienceCompany = audienceData.companyName;

      expect(fs.existsSync(audienceData.outputPath), `Output XLS was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const xlsRows = XLSX.utils.sheet_to_json<Record<string, string>>(
        Object.values(XLSX.readFile(audienceData.outputPath).Sheets)[0]);
      expect(xlsRows[0]?.['Investment ID'], 'Pre-condition 5.1: Investment ID cell of the XLS').toBe('test');
      await testInfo.attach(`XLS-Audience-${TC}.xls`, { path: audienceData.outputPath, contentType: 'application/vnd.ms-excel' });

      console.log('  OK - XLS file created and verified - file exists on disk');
      console.log(`  - Import file attached : XLS-Audience-${TC}.xls`);
      console.log(`  - Output path      : ${audienceData.outputPath}`);
      console.log(`  - Contact Name     : ${audienceData.contactName}`);
      console.log(`  - Email_Contact#1  : ${audienceData.emailContact1}`);
      console.log(`  - Company          : ${audienceData.companyName}`);
    });

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
      await investmentPage.uploadAudienceCSV(audienceData.outputPath);
      console.log(`  OK - XLS file uploaded: ${audienceData.outputPath}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);
      await investmentPage.clickImportButton();
      console.log('  OK - Import completed');
    });

    await test.step(STEP.s5, async () => {
      console.log(`\n--- ${STEP.s5} ---`);
      await investmentPage.clickSaveButton();
      console.log('  OK - Investment record saved');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Investment saved after IMPORT');
    });

    await test.step(STEP.v1, async () => {
      console.log(`\n--- ${STEP.v1} ---`);
      // The import commits through the queue a few seconds after SAVE - poll the list up to ~30 s.
      await investmentPage.openCrmPipeline();
      let rows = await searchOpportunitiesByEmail(page, audienceEmail);
      for (let attempt = 1; rows === 0 && attempt <= 3; attempt++) {
        await page.waitForTimeout(CommonUtils.waitTimes.long);
        await investmentPage.openCrmPipeline();
        rows = await searchOpportunitiesByEmail(page, audienceEmail);
      }
      const opp = await readOpportunity(page, { email: audienceEmail, readInvestmentOnForm: true });
      logOpportunity('Opportunity read on screen:', opp);
      const checks = importedOpportunityChecks(rows, opp, {
        contactName: audienceData.contactName,
        companyName: audienceCompany,
        email: audienceEmail,
        investmentDbId: investmentId,
        investmentOnForm: `${investmentID} - ${investmentName}`,
      });
      const { allPass, lines } = printVerify(checks, 'the import created exactly 1 Opportunity carrying the file data and this Investment');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Opportunity`, passed: allPass, lines }).catch(() => {});
      for (const c of checks) expect(c.actual, c.label).toEqual(c.expected);
    });

    await test.step(STEP.v2, async () => {
      console.log(`\n--- ${STEP.v2} ---`);
      const r = await readImportedContacts(page, audienceEmail, audienceData.contactName);
      console.log(`  Contacts rows for Email_Contact#1 : ${JSON.stringify(r.rowNames)}`);
      console.log(`  Rows left by "Companies"         : ${JSON.stringify(r.companyRowNames)}`);
      logContact('Company_Contact#1 read on screen:', r.company);
      logContact('Name_Contact#1 read on screen:', r.person);
      const checks = importedContactsChecks(r, { contactName: audienceData.contactName, companyName: audienceCompany, email: audienceEmail });
      const { allPass, lines } = printVerify(checks, 'the import created exactly 2 Contacts: the company and the individual under it');
      await CommonUtils.captureVerifyEvidence(page, testInfo, { name: `${TC} - Contacts`, passed: allPass, lines }).catch(() => {});
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
