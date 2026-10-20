import { test, expect, Browser } from '@playwright/test';
import * as fs from 'fs';
import { config } from '@config/test.config';
import { users, baseUrl_mig } from '@config/users.config';
import { LoginPageMig, HomePageMig } from '@pages/mig';
import { OpportunityPage, QuotationPage } from '@pages';
import { InvestmentPageMig } from '@pages/mig/InvestmentPageMig';
import { CommonUtils } from '@helpers/common.utils';
import {
  resetMigCreatedRecords,
  registerMigRecord,
  registerMigRecordFromUrl,
  teardownMigRecords,
  listMigCreatedRecords,
  addDealElementOnO12CE,
  pressNewQuotationOnO12CE,
  confirmQuotationOnO12CE,
} from '@helpers/o12ce-main-business.helper';

/**
 * ============================================================================================
 *  CRM-12370_8.3.14 - Investment Quotes tab: "Total in Company Currency" (O12 CE Migration server)
 * ============================================================================================
 *  Test Case ID    : CRM-12370_8.3.14
 *  Automation-Type : ported
 *  Automation-Date : 2026-10-19
 *  Run as          : Administrator (users.admin_crm_mig - anh.ho@nakivo.com)
 *  Host            : crm-mig.nakivo.site (db nakivoCE)
 *
 *  Source TC (pre-production) : CRM-2482_2.2.9.7
 *  Source spec                : tests/1.Project_CRM/4.Investments/CRM-2482_Investments_module-General_fields/
 *                               2.Investment_record/2.2.Tabs/2.2.9.Quotes_tab/
 *                               tc-crm-2482-2-2-9-7-Verify-Quotes_tab-has-Total_in_Company_Currency-field.spec.ts
 *  Source version             : 74dc5b6 2026-05-18 (no uncommitted working-tree edits to this file)
 *  Jira                       : none (the source is a pre-production spec, not a Jira TC)
 *  Command to run             : npx playwright test --grep "CRM-12370_8\.3\.14:" --project=MigSmoke
 *
 * --------------------------------------------------------------------------------------------
 *  Summary
 * --------------------------------------------------------------------------------------------
 *  Creates its own Investment, imports a one-company audience, creates a Deal Element and a
 *  Quotation on the imported Opportunity, reads the Quotation's "Total in Company Currency",
 *  confirms it, then verifies the Investment's Quotes tab shows the same value - pre-production
 *  assertion unchanged.
 *
 * --------------------------------------------------------------------------------------------
 *  KNOWN BLOCKER (2026-10-19) - RED BY DESIGN. Do NOT test.skip / test.fail / soften.
 * --------------------------------------------------------------------------------------------
 *  On crm-mig, pressing IMPORT on the Investment Audience tab raises an Odoo Server Error:
 *    AttributeError: 'bool' object has no attribute 'keys'
 *    (nakivo_invesment_tracking/models/investment_activities_file_import.py line 321, _check_is_valid:
 *     pdDatas['isSalePerson'] = [not d or d and d in list(salespersons.keys()) ...])
 *  InvestmentPageMig.clickImportButton() detects the dialog and throws
 *    "IMPORT refused by the server (Odoo Server Error): AttributeError: ..."
 *  => every run of this spec fails at Pre-condition I.6. That is the finding.
 *
 *  NEVER EXECUTED ON CRM-MIG (ported blind - re-verify the day the import is fixed):
 *    - Pre-condition I.7 and I.8 (copy URL, back to Home)
 *    - Pre-condition II.1 to II.12 (CRM > view list > search Email_Contact#1 > open the Opportunity >
 *      DEAL ELEMENT + Pricelist/Payment Term/product + SAVE > NEW QUOTATION > read Total > CONFIRM)
 *    - Steps 1 to 3 and the VERIFY block (the Quotes tab Total comparison)
 *    - the chain records' teardown (Opportunity, Deal Element, Quotation / Sale Order)
 *    - the Opportunity row lookup by email and the async Lead/Partner creation after the import
 *
 * --------------------------------------------------------------------------------------------
 *  O12 CE deviations (mechanical only - BASELINE RULE: the assertion is copied unchanged)
 * --------------------------------------------------------------------------------------------
 *  - Login users.admin_crm_mig on baseUrl_mig; CRM and Investments navigation by the Mig page objects
 *    (HomePageMig / InvestmentPageMig: XML-id URL hash, not menu text).
 *  - Investment name carries the run marker "TEST CRM-12370_8.3.14 ..." so the afterAll sweep finds leftovers.
 *  - Test data not present on crm-mig (substitutions, same as the verified CRM-12370_8.3.5 template):
 *      Completion Events : Attended webinar    -> Atttended webinar
 *      Conversion Events : Download free trial -> Downloaded free trial
 *  - Product: the source says "select the first one" from the Add-a-product dropdown. The chain helper
 *    addDealElementOnO12CE types "NAKIVO Backup". An exact-name search for "NAKIVO Backup" on crm-mig
 *    finds no product.template (checked 2026-10-19), but an ilike search returns 20+ "NAKIVO Backup ..."
 *    products, so the many2one will pick a match. Substituted, not verified on screen.
 *  - Pre-condition II.6 to II.9 are grouped into ONE step (the helper runs them as its own sub-steps);
 *    the grouping keeps the source range in the label.
 *  - Source "Tear Down" (UI delete of the Investment and the CSV) is replaced by the afterEach RPC
 *    teardown: the Investment, the Leads / partners the import created, the chain records
 *    (Opportunity, Deal Element, Quotation / Sale Order) and the CSV file.
 *  - Audience CSV written as CSV-Audience-CRM-12370_8.3.14.csv so parallel specs never overwrite each other.
 *
 * --------------------------------------------------------------------------------------------
 *  Source manual TC - verbatim from the source spec's header comment (pre-production)
 * --------------------------------------------------------------------------------------------
 * Investments - Quotes Tab Verification Test
 * Test Case ID: CRM-2482_2.2.9.7
 *
 * Summary: Verify the Quotes tab of an Investment record includes "Total in Company Currency" field
 *
 * Command to run:
 * npx playwright test --grep "CRM-2482_2\.2\.9\.7" --project=chromium
 *
 * Pre-condition:
 * I. Create Investment#1 and import audiences:
 * 1. After login successful, click at "Investments" button
 * 2. On "Investments" page, on menu on top of page, select "Investment" item
 * 3. Press "CREATE" button and wait
 * 4. Create a blank Investment by doing the following sub-steps:
 *    - "Investment Name" textbox        = TEST Investment + current date time
 *    - "Investment ID" textbox          = TEST-Investment-current date time
 *    - "Type" combobox                  = Webinar
 *    - "Channel" combobox               = Channel (search name of CMR in channel field)
 *    - "Countries" combobox             = Albania
 *    - "Date start" date                = current date
 *    - "Date end" date                  = current date
 *    - "Responsible - Sales" combobox   = Aleksey Galbur
 *    - "Responsible - Marketing" combobox = Nadiia Suprun
 *    - "NBR Product List" combobox      = M365
 *    - "Completion Events" combobox     = Attended webinar
 *    - "Conversion Events" combobox     = Download free trial
 *    - "Track conversion date start" date = current date
 *    - "Track conversion date end" date   = current date + 6 months
 * 5. Create an Import Audience file by doing the following:
 *    5.1. Create the test data with the following information:
 *         - "Contact Name" = TEST_first_name-TEST_last_name + current date time
 *         - "Email" = use the template: Test@company + current date + current time.com
 *           (Remember the created email, called Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = test
 *         - "Investment ID" = test
 *    5.2. Use the template CSV file "CSV-AudienceTemplate-1.csv" in folder "CRM_AUTO\test-data\investment-module"
 *    5.3. Create another CSV file (named CSV-Audience-copy1) and put the data at Step#1 to respective columns:
 *         - "Contact Name" = TEST_first_name-TEST_last_name + current date time
 *         - "Email" = Test@company + current date + current time.com  (Email_Contact#1)
 *         - "Company" = TEST_company_name + current date time
 *         - "Phone" = 1234125125
 *         - "Country" = China
 *         - "Sales Team" = CMR
 *         - "Salesperson" = Sergey Karachin
 *         - "Tags" = test
 *         - "Investment ID" = test
 *    5.4. Save the file in folder "CRM_AUTO\test-data\investment-module"
 * 6. Import a Company from CSV-Audience-copy1 file
 * 7. Copy the current URL called URL_Investment#1
 * 8. Press "Application" button to back to Home page
 *
 * II. Create Quotation:
 * 1. Click at "CRM" button
 * 2. On "CRM" page, click at "view list" button
 * 3. On "Search" textbox, remove "My Pipeline" and wait
 * 4. On "Search" textbox, enter value of "Company Email" then enter to start to search
 * 5. On "Opp" page, click at the line of "Email" = value of "Email_Contact#1"
 * 6. On "Opp" page, press "DEAL ELEMENT" button
 * 7. Once the "Deal Element" screen shows up select the following:
 *    - Pricelist = Public Pricelist_USD (USD)
 *    - Payment Term = Immediate Payment
 * 8. At "Order Lines" section:
 *    - Press "Add a product" link, when a dropdown list of "Product" displays, select the first one
 * 9. Finally, press "SAVE" button on the top page and wait
 * 10. Press "NEW QUOTATION" button and wait
 * 11. Get the value of "Total in Company Currency" called Quotation_Total_Company_Currency_Contact#1
 * 12. Press "CONFIRM" button and wait to create a Sales Order
 *
 * Steps to reproduce:
 * 1. Launch the webpage with URL_Investment#1
 * 2. Click at "Quotes" tab
 * 3. Verify the following:
 *    3.1. Value at "Total in Company Currency" row = value of Quotation_Total_Company_Currency_Contact#1
 *
 * Tear down (Clean up test data):
 * 1. Delete Investment item has just created by doing the following steps:
 *    1.1. Select "Action" dropdown list on header of page
 *    1.2. Select "Delete" option
 *    1.3. Press "OK" button on "Are you sure you want to delete this record?" window
 * 2. Delete CSV file (CSV-Audience-copy1) has just created
 * ============================================================================================
 */

const TC = 'CRM-12370_8.3.14';

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
  i1: 'Pre-condition I.1: Login as Admin on crm-mig',
  i2: 'Pre-condition I.2: On "Investments" page, select "Investment" from the top menu',
  i3: 'Pre-condition I.3: Press "CREATE" button and wait for the form to open',
  i4: 'Pre-condition I.4: Create a blank Investment',
  i5: 'Pre-condition I.5: Create an Import Audience file (CSV-Audience-copy1.csv)',
  i6: 'Pre-condition I.6: Import a Company from CSV-Audience-copy1 file',
  i7: 'Pre-condition I.7: Copy URL_Investment#1',
  i8: 'Pre-condition I.8: Press "Application" button to back to Home page',
  ii1: 'Pre-condition II.1: Click at "CRM" button',
  ii2: 'Pre-condition II.2: Click at "view list" button',
  ii3: 'Pre-condition II.3: On "Search" textbox, remove "My Pipeline" and wait',
  ii4: 'Pre-condition II.4: On "Search" textbox, enter Email_Contact#1 and press Enter',
  ii5: 'Pre-condition II.5: On "Opp" page, click the row where Email = Email_Contact#1',
  ii6: 'Pre-condition II.6-II.9: Press "DEAL ELEMENT"; select Pricelist = "Public Pricelist_USD" and Payment Term = "Immediate Payment"; add a product at "Order Lines"; press SAVE',
  ii10: 'Pre-condition II.10: Press "NEW QUOTATION" button and wait',
  ii11: 'Pre-condition II.11: Get the value of "Total in Company Currency" (Quotation_Total_Company_Currency_Contact#1)',
  ii12: 'Pre-condition II.12: Press "CONFIRM" button and wait to create a Sales Order',
  s1: 'Step 1: Launch the webpage with URL_Investment#1',
  s2: 'Step 2: Click at "Quotes" tab',
  s3: 'Step 3: Verify "Total in Company Currency" row = value of Quotation_Total_Company_Currency_Contact#1',
} as const;

/** Per-test state the afterEach needs. */
let investmentId = 0;
let audienceEmail = '';
let audienceCompany = '';
let audienceFile = '';

test.describe(`${TC} - Investment Quotes tab: Total in Company Currency`, () => {
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

  test(`${TC}: Verify the Quotes tab of an Investment record includes "Total in Company Currency" field`, async ({ page }, testInfo) => {
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
    const homePage = new HomePageMig(page);
    const opportunityPage = new OpportunityPage(page);
    const quotationPage = new QuotationPage(page);
    let audienceData: Awaited<ReturnType<typeof investmentPage.createImportAudienceFile>>;
    let investmentUrl = '';
    let oppId = '';
    let totalInCompanyCurrency = '';

    // ===== PRE-CONDITION I: Create Investment#1 and import audiences =====

    await test.step(STEP.i1, async () => {
      console.log(`\n--- ${STEP.i1} ---`);
      resetMigCreatedRecords();
      console.log(`  - Host    : ${baseUrl_mig}`);
      console.log(`  - Account : ${users.admin_crm_mig.username}`);
      await loginPage.navigateTo(baseUrl_mig);
      await loginPage.login(users.admin_crm_mig.username, users.admin_crm_mig.password);
      console.log('  OK - logged in');
    });

    await test.step(STEP.i2, async () => {
      console.log(`\n--- ${STEP.i2} ---`);
      await investmentPage.navigateToInvestment();
      console.log('  OK - Investments list is open');
    });

    await test.step(STEP.i3, async () => {
      console.log(`\n--- ${STEP.i3} ---`);
      await investmentPage.clickCreateButton();
      console.log('  OK - CREATE form is open');
    });

    await test.step(STEP.i4, async () => {
      console.log(`\n--- ${STEP.i4} ---`);
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
    });

    await test.step(STEP.i5, async () => {
      console.log(`\n--- ${STEP.i5} ---`);
      audienceData = await investmentPage.createImportAudienceFile({ investmentId: 'test', outputFileName: `CSV-Audience-${TC}.csv` });
      audienceFile = audienceData.outputPath;
      audienceEmail = audienceData.emailContact1;
      audienceCompany = audienceData.companyName;

      expect(fs.existsSync(audienceData.outputPath), `Output CSV was not created at: ${audienceData.outputPath}`).toBeTruthy();
      const savedContent = fs.readFileSync(audienceData.outputPath, 'utf-8');
      expect(savedContent).toContain(audienceData.contactName);
      expect(savedContent).toContain(audienceData.emailContact1);
      expect(savedContent).toContain(audienceData.companyName);
      expect(savedContent).toContain('test'); // Investment ID
      console.log(`  - Email_Contact#1   : ${audienceData.emailContact1}`);
      console.log(`  - Company_Contact#1 : ${audienceData.companyName}`);
    });

    await test.step(STEP.i6, async () => {
      console.log(`\n--- ${STEP.i6} ---`);
      await investmentPage.importCompanyAudience(audienceData.outputPath);
      console.log(`  OK - audience imported and the record saved: ${audienceData.outputPath}`);
    });

    await test.step(STEP.i7, async () => {
      console.log(`\n--- ${STEP.i7} ---`);
      investmentUrl = page.url();
      console.log(`  URL_Investment#1 : ${investmentUrl}`);
    });

    await test.step(STEP.i8, async () => {
      console.log(`\n--- ${STEP.i8} ---`);
      await homePage.returnToHome();
      console.log('  OK - back on the Home page');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition I - Investment imported, back on Home');
    });

    // ===== PRE-CONDITION II: Create Quotation and Sales Order on the imported Opportunity =====

    await test.step(STEP.ii1, async () => {
      console.log(`\n--- ${STEP.ii1} ---`);
      await investmentPage.openCrmPipeline();
      console.log('  OK - CRM opened');
    });

    await test.step(STEP.ii2, async () => {
      console.log(`\n--- ${STEP.ii2} ---`);
      await opportunityPage.switchToListView();
      console.log('  OK - list view');
    });

    await test.step(STEP.ii3, async () => {
      console.log(`\n--- ${STEP.ii3} ---`);
      await opportunityPage.removeMyPipelineFilter();
      console.log('  OK - "My Pipeline" removed');
    });

    await test.step(STEP.ii4, async () => {
      console.log(`\n--- ${STEP.ii4} ---`);
      await opportunityPage.searchByEmail(audienceData.emailContact1);
      console.log(`  OK - searched for ${audienceData.emailContact1}`);
    });

    await test.step(STEP.ii5, async () => {
      console.log(`\n--- ${STEP.ii5} ---`);
      await opportunityPage.clickOppRowByEmail(audienceData.emailContact1);
      oppId = idFromUrl(page.url());
      registerMigRecordFromUrl(page.url(), 'Opportunity (lead created by the audience import)', 'crm.lead');
      InvestmentPageMig.logUrl('Opportunity', page.url());
      console.log(`  OK - Opportunity id ${oppId}`);
    });

    await test.step(STEP.ii6, async () => {
      console.log(`\n--- ${STEP.ii6} ---`);
      await addDealElementOnO12CE(page);
      console.log('  OK - Deal Element saved');
    });

    await test.step(STEP.ii10, async () => {
      console.log(`\n--- ${STEP.ii10} ---`);
      const quotation = await pressNewQuotationOnO12CE(page, { opportunityId: oppId });
      console.log(`  OK - Quotation ${quotation.quotationName || '(name not resolved)'} (landed=${quotation.landedOnQuotation})`);
    });

    await test.step(STEP.ii11, async () => {
      console.log(`\n--- ${STEP.ii11} ---`);
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
      totalInCompanyCurrency = await quotationPage.getTotalInCompanyCurrency();
      console.log(`  Quotation_Total_Company_Currency_Contact#1 : ${totalInCompanyCurrency}`);
    });

    await test.step(STEP.ii12, async () => {
      console.log(`\n--- ${STEP.ii12} ---`);
      await confirmQuotationOnO12CE(page);
      console.log('  OK - Quotation confirmed, Sales Order created');
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Pre-condition II - Sales Order confirmed');
    });

    // ===== STEPS TO REPRODUCE =====

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      console.log(`  - Navigating to: ${investmentUrl}`);
      await page.goto(investmentUrl);
      await page.waitForTimeout(CommonUtils.waitTimes.long);
      console.log('  OK - Investment record (URL_Investment#1) open');
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await investmentPage.clickQuotesTab();
      console.log('  OK - Quotes tab clicked');
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      const actualValue = await investmentPage.getQuotesFirstRowCellText('Total in Company Currency');
      const ok = actualValue === totalInCompanyCurrency;

      console.log('\n==================== VERIFY ====================');
      console.log('  Verify #3.1 - "Total in Company Currency" of the Quotes tab first row:');
      console.log(`     Expected : "${totalInCompanyCurrency}" (Quotation_Total_Company_Currency_Contact#1)`);
      console.log(`     Actual   : "${actualValue}"`);
      console.log(`     Result   : ${ok ? 'PASS' : 'FAIL'}`);
      console.log('===============================================');
      console.log(`OVERALL: ${ok ? 'PASS' : 'FAIL'} - Quotes "Total in Company Currency" check`);

      let __verifyPassed = false;
      try {
        expect(actualValue, 'Step 3.1: "Total in Company Currency" in Quotes tab should match Quotation_Total_Company_Currency_Contact#1').toBe(totalInCompanyCurrency);
        __verifyPassed = true;
      } finally {
        await CommonUtils.captureVerifyEvidence(page, testInfo, {
          name: `${TC} - Quotes Total in Company Currency`,
          passed: __verifyPassed,
        }).catch(() => {});
      }
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, 'Steps to reproduce - Quotes row verified');
    });
  });
});

function formatMDY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Record id from a saved-form URL (`#id=123&model=...`), '' when absent. */
function idFromUrl(url: string): string {
  return (url.match(/[?#&]id=(\d+)/) || [])[1] ?? '';
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
