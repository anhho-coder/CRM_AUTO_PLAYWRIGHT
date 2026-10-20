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
 *  CRM-12370_8.3.13 - Investment Lead tab: "ER after probability" (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.3.13
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_2.2.8.13
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/
 *                               2.Investment_record/2.2.Tabs/2.2.8.Leads_tab/
 *                               tc-crm-2482-2-2-8-13-Verify-Lead_tab-has-ER_after_probability-field.spec.ts
 *  Source version             : commit 74dc5b6 (2026-05-18), working tree clean - re-check before trusting this spec
 *
 * --------------------------------------------------------------------------------------------
 *  KNOWN BLOCKER (2026-10-19)
 * --------------------------------------------------------------------------------------------
 *  Step 1 (IMPORT of the audience file) is refused by the crm-mig server, so this spec is RED by
 *  design until the server is fixed. Quoted error:
 *    IMPORT refused by the server (Odoo Server Error): AttributeError: 'bool' object has no attribute 'keys'
 *    nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, in _check_is_valid:
 *      pdDatas['isSalePerson'] = [not d or d and d in list(salespersons.keys()) ...]
 *  Steps after the import are ported faithfully and are not reached until the import is fixed.
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, imports a one-company audience CSV into it, then verifies the
 *  Leads tab's first row "ER after probability" equals 37.50 - pre-production assertion unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  Command to run
 * --------------------------------------------------------------------------------------------
 *  npx playwright test --grep "CRM-12370_8\.3\.13:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; navigation by XML-id URL hash (InvestmentPageMig).
 *  - Investment Name carries the run marker "TEST CRM-12370_8.3.13 ..." for the afterAll sweep.
 *  - Test data substituted (same intent, existing record on crm-mig):
 *      Completion Events : Attended webinar    -> Atttended webinar     (crm-mig event-type name, sic)
 *      Conversion Events : Download free trial -> Downloaded free trial (crm-mig event-type name)
 *  - Audience file: CSV-Audience-CRM-12370_8.3.13.csv (unique per TC).
 *  - Clean-up: afterEach deletes, over RPC, this run's Investment, the Leads linked to it and the
 *    partners carrying this run's unique email / company (deny-list); afterAll sweeps by name marker.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC
 * --------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. Login and navigate to the Investments module
 *    2. On "Investments" page, select "Investment" from the top menu
 *    3. Press "CREATE" button and wait for the form to open
 *    4. Create a blank Investment with the following fields:
 *         - Investment Name             = TEST CRM-12370_8.3.13 Investment <datetime>
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
 *            - Company       = TEST_company_name_<timestamp>
 *            - Phone         = 1234125125
 *            - Country       = China
 *            - Sales Team    = CMR                                           (Sales_Team_Contact#1)
 *            - Salesperson   = Sergey Karachin                              (Salesperson_Contact#1)
 *            - Tags          = test
 *            - Investment ID = test
 *       5.2. Read template CSV: CSV-AudienceTemplate-1.csv
 *       5.3. Fill test data into respective columns and create CSV-Audience-copy1
 *       5.4. Save the file to test-data/investment-module/CSV-Audience-copy1.csv
 *  Steps to reproduce:
 *    1. Import a Company from CSV-Audience-copy1 file
 *    2. Click at "Leads" tab
 *    3. Verify the following:
 *       3.1. Value at "ER after probability" row = 37.50
 *  Tear down:
 *    1. Delete the Investment record (and, on crm-mig, the Leads / partners the import created)
 *    2. Delete the created CSV file (CSV-Audience-copy1.csv)
 * ============================================================================================
 */

const TC = 'CRM-12370_8.3.13';

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
  s1: 'Step 1: Import a Company from CSV-Audience-copy1 file',
  s2: 'Step 2: Click at "Leads" tab',
  s3: 'Step 3: Verify "ER after probability" value in Leads tab equals 37.50',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;
let audienceEmail = '';
let audienceCompany = '';
let audienceFile = '';

test.describe(`${TC} - Investment Lead tab: ER after probability`, () => {
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

  test(`${TC}: Verify the Lead tab of a Investment record includes "ER after probability" field`, async ({ page }, testInfo) => {
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
      audienceData = await investmentPage.createImportAudienceFile({ investmentId: 'test', outputFileName: `CSV-Audience-${TC}.csv` });
      audienceFile = audienceData.outputPath;
      audienceEmail = audienceData.emailContact1;
      audienceCompany = audienceData.companyName;

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);
      expect(savedContent).toContain('test');
      console.log(`  - Name_Contact#1        : ${audienceData.contactName}`);
      console.log(`  - Email_Contact#1       : ${audienceData.emailContact1}`);
      console.log(`  - Company               : ${audienceData.companyName}`);
      console.log(`  - Sales_Team_Contact#1  : ${audienceData.salesTeam}`);
      console.log(`  - Salesperson_Contact#1 : ${audienceData.salesperson}`);
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await investmentPage.importCompanyAudience(audienceData.outputPath);
      console.log(`  OK - audience imported and the record saved: ${audienceData.outputPath}`);
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await investmentPage.clickLeadsTab();
      console.log('  OK - Leads tab is open');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const fieldText = await investmentPage.getLeadsFirstRowCellText('ER after probability');
      const ok = fieldText === '37.50';

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #3.1 - "ER after probability" of the first Leads row:');
      console.log('     Expected : equals "37.50"');
      console.log(`     Actual   : "${fieldText}"`);
      console.log(`     Result   : ${ok ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${ok ? 'PASS' : 'FAIL'} - Leads "ER after probability" check`);

      let __verifyPassed = false;
      try {
        expect(fieldText, 'Step 3.1: ER after probability should equal 37.50').toBe('37.50');
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Leads ER after probability`,
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
