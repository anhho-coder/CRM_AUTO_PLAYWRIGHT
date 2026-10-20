import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
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

/**
 * ============================================================================================
 *  CRM-12370_8.5.1 - Import audience and link the new Contact / Opportunity (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.5.1
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_4.1.1.1.1
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/
 *                               4.Linking_object_linking_through_Customer_events/
 *                               tc-crm-2482-4-1-1-1-1-Verify-import-audiences-link-Opp.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18), working tree clean - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  KNOWN BLOCKER (2026-10-19)
 * --------------------------------------------------------------------------------------------
 *  Step 6 (IMPORT of the audience file) is refused by the crm-mig server, so this spec is RED by
 *  design until the server is fixed. Quoted error:
 *    IMPORT refused by the server (Odoo Server Error): AttributeError: 'bool' object has no attribute 'keys'
 *    nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, in _check_is_valid:
 *      pdDatas['isSalePerson'] = [not d or d and d in list(salespersons.keys()) ...]
 *  Steps after the import (Step 7 SAVE, Step 8 Leads tab, Step 9 verify) are ported faithfully and
 *  are not reached until the import is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, imports a one-company audience CSV into it, saves, then verifies on
 *  the Leads tab the first row's Opportunity, Email, Sales Team and Salesperson - pre-production
 *  assertions unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.5\.1:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertions are copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - The audience file now carries the Investment ID of THIS run's Investment. The pre-production
 *    source leaves that column empty and crm-mig refuses it with 'Lines [2] "Investment ID" is empty'
 *    (seen 2026-10-20 on CRM-12370_8.5.1) - the same rule CRM-3374_3.1 tests.
 *  - Login users.admin_crm_mig on baseUrl_mig; navigation by XML-id URL hash (InvestmentPageMig).
 *  - Investment Name carries the run marker "TEST CRM-12370_8.5.1 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - Audience file: CSV-Audience-CRM-12370_8.5.1.csv (unique per TC).
 *  - The source's tear-down steps are replaced by the afterEach ledger teardown (RPC, deny-list) and
 *    the file removal. NOTE: the source file's comments say "SKIPPED - remove the comment below to
 *    enable" above its tear-down steps, but the code runs; the port does not carry that comment.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. After login successful, click at "Investments" button
 *    2. On "Investments" page, on menu on top of page, select "Investment" item
 *    3. Press "CREATE" button and wait
 *    4. Create a blank Investment with the following fields:
 *         - Investment Name             = TEST CRM-12370_8.5.1 Investment <datetime>
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
 *    5. Create an Import Audience file:
 *       5.1. Generate test data:
 *            - Contact Name  = TEST_first_name-TEST_last_name_<timestamp>   (Name_Contact#1)
 *            - Email         = Test@company<YYYY>-<MM>-<DD><HHMMSS>.com     (Email_Contact#1)
 *            - Company       = TEST_company_name_<timestamp>                (Company_Contact#1)
 *            - Phone         = 1234125125
 *            - Country       = China
 *            - Sales Team    = CMR                                           (Sales_Team_Contact#1)
 *            - Salesperson   = Sergey Karachin                              (Salesperson_Contact#1)
 *            - Tags          = test
 *            - Investment ID = <Investment ID of this Investment>  (TEST-Investment-<datetime>)
 *       5.2. Read template CSV: CSV-AudienceTemplate-1.csv
 *       5.3. Fill test data into respective columns and create CSV-Audience-copy1
 *       5.4. Save the file to test-data/investment-module/CSV-Audience-copy1.csv
 *  Steps to reproduce:
 *    1. On Investment page, press "EDIT" button and wait
 *    2. Click at "Audience" tab
 *    3. On "Audience" section, click at "UPLOAD YOUR FILE" button
 *    4. Navigate to folder "CRM_AUTO\test-data\investment-module"
 *    5. Select CSV-Audience-copy1 file and wait
 *    6. Press "IMPORT" button and wait
 *    7. Press "SAVE" button on Investment page
 *    8. Click at "Leads" tab
 *    9. Verify the following:
 *       9.1. Value at "Opportunity" row = Name_Contact#1
 *       9.2. Value at "Email" row       = Email_Contact#1
 *       9.3. Value at "Sales Team" row  = Sales_Team_Contact#1
 *       9.4. Value at "Salesperson" row = Salesperson_Contact#1
 * ============================================================================================
 */

const TC = 'CRM-12370_8.5.1';

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
  pre5: 'Pre-condition 5: Create an Import Audience file (CSV-Audience-copy1.csv)',
  s1: 'Step 1: On Investment page, press "EDIT" button and wait',
  s2: 'Step 2: Click at "Audience" tab',
  s3: 'Step 3-5: On "Audience" section, click "UPLOAD YOUR FILE", navigate to folder and select CSV-Audience-copy1',
  s4: 'Step 6: Press "IMPORT" button and wait',
  s5: 'Step 7: Press "SAVE" button on Investment page',
  s6: 'Step 8: Click at "Leads" tab',
  s7: 'Step 9: Verify Opportunity, Email, Sales Team and Salesperson in the Leads tab',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;
let audienceEmail = '';
let audienceCompany = '';
let audienceFile = '';

test.describe(`${TC} - Import audience and link the new Contact / Opportunity`, () => {
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
      const created = await new InvestmentPageMig(page).findImportCreatedRecords(investmentId, audienceEmail, audienceCompany);
      created.leadIds.forEach((id) => registerMigRecord('crm.lead', id, 'Lead created by the audience import'));
      created.partnerIds.forEach((id) => registerMigRecord('res.partner', id, 'Partner created by the audience import', { deleteLast: true }));
    } catch (e: any) {
      console.log(`  [mig-cleanup] could not list the import-created records: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    // Evidence: the URL of every record this test created, printed before teardown removes (or keeps) them.
    await new InvestmentPageMig(page).logRecordUrls(TC, listMigCreatedRecords()).catch(() => {});
    // TEMPORARY - teardown paused when this TC fails, see InvestmentPageMig.TEARDOWN_PAUSED_ON_FAILURE.
    if (InvestmentPageMig.keepFailedRunData(TC, testInfo)) {
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

  test(`${TC}: Verify new contact/Opp link after importing new audience using csv file`, async ({ page }, testInfo) => {
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
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;

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
      audienceData = await investmentPage.createImportAudienceFile({ investmentId: investmentID, outputFileName: `CSV-Audience-${TC}.csv` });
      audienceFile = audienceData.outputPath;
      audienceEmail = audienceData.emailContact1;
      audienceCompany = audienceData.companyName;

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);
      expect(savedContent, 'the file must carry the Investment ID of this Investment').toContain(investmentID);

      console.log('  OK - File content verified - Contact Name, Email, and Company Name present');
      console.log(`  - Name_Contact#1        : ${audienceData.contactName}`);
      console.log(`  - Email_Contact#1       : ${audienceData.emailContact1}`);
      console.log(`  - Company_Contact#1     : ${audienceData.companyName}`);
      console.log(`  - Sales_Team_Contact#1  : ${audienceData.salesTeam}`);
      console.log(`  - Salesperson_Contact#1 : ${audienceData.salesperson}`);
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
      console.log(`  OK - CSV file uploaded: ${audienceData.outputPath}`);
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
    });

    await test.step(STEP.s6, async () => {
      console.log(`\n--- ${STEP.s6} ---`);
      await investmentPage.clickLeadsTab();
      console.log('  OK - Leads tab clicked');
    });

    await test.step(STEP.s7, async () => {
      console.log(`\n--- ${STEP.s7} ---`);
      const opportunityText = await investmentPage.getLeadsFirstRowCellText('Opportunity');
      const emailText = await investmentPage.getLeadsFirstRowCellText('Email');
      const salesTeamText = await investmentPage.getLeadsFirstRowCellText('Sales Team');
      const salespersonText = await investmentPage.getLeadsFirstRowCellText('Salesperson');

      const checks = [
        { name: '9.1 Opportunity', expected: audienceData.contactName, actual: opportunityText },
        { name: '9.2 Email', expected: audienceData.emailContact1, actual: emailText },
        { name: '9.3 Sales Team', expected: audienceData.salesTeam, actual: salesTeamText },
        { name: '9.4 Salesperson', expected: audienceData.salesperson, actual: salespersonText },
      ];
      const allOk = checks.every((c) => c.actual === c.expected);

      console.log('\n==================== VERIFY ====================');
      checks.forEach((c, i) => {
        console.log(`  Verify #${c.name} - first Leads row:`);
        console.log(`     Expected : "${c.expected}"`);
        console.log(`     Actual   : "${c.actual}"`);
        console.log(`     Result   : ${c.actual === c.expected ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      console.log(`OVERALL: ${allOk ? 'PASS' : 'FAIL'} - Leads tab link check (Opportunity, Email, Sales Team, Salesperson)`);

      let __verifyPassed = false;
      try {
        expect(opportunityText, 'Step 9.1: Opportunity mismatch').toBe(audienceData.contactName);
        expect(emailText, 'Step 9.2: Email mismatch').toBe(audienceData.emailContact1);
        expect(salesTeamText, 'Step 9.3: Sales Team mismatch').toBe(audienceData.salesTeam);
        expect(salespersonText, 'Step 9.4: Salesperson mismatch').toBe(audienceData.salesperson);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Leads row`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Leads row verified');
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
