import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  Opportunity screen verification - Empty fields
 * =============================================================================================
 *  Test Case ID    : TC.Performance.1.1.2.29
 *  Jira            : (authored with the batch - the Xray issue is created after the first green run)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-21
 *  Feature folder  : tests/1.Project_CRM/1.SalesReport_Performance/2.Opportunity/2.3.Opportunity_information
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The spec creates its own Opportunity on pre-production, tagged with the run token <unique>
 *  (a timestamp) so the record can always be found again, and then asserts the ONE aspect this
 *  test case owns: verify that the information-area fields the CREATE form does not ask for are still empty on the saved Opportunity, and pin the two fields that print the literal string "false" instead.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "TC\\.Performance\\.1\\.1\\.2\\.29:" --project=SalesReport_Performance
 *
 *  Source manual TC
 *  ---------------------------------------------------------------------------------------------
 *  Pre-condition(s):
 *    1. Logged in to pre-production.nakivo.site with the CRM admin account
 *    2. The CRM > Opportunities list is reachable
 *    3. Each run uses its own token <unique> (a timestamp) so the Opportunity it creates can always be found again
 *
 *  Steps to reproduce:
 *    1. Go to CRM > Opportunities (list view) and click CREATE
 *    2. Fill the Opportunity form:
 *       - Opportunity     = AUTO TC.Performance.1.1.2.29 <unique>
 *       - Contact Name    = Contact Name TC.Performance.1.1.2.29
 *       - Email           = Test-Opp@company<unique>.com
 *       - Street          = 123street
 *       - Country         = United States
 *       - State           = Connecticut
 *       - Sales Team      = cleared
 *       - Salesperson     = cleared
 *       - Create manually = unchecked
 *       - Lead Form (CRM Developer tab) = License
 *    3. Click SAVE and wait until Odoo has created the Company from the e-mail domain
 *    4. Read the fields of the information area that were never filled
 *
 *  Verification:
 *    4. Every information-area field the CREATE form never asked for is empty:
 *    - Email CC, Linkedin, Country Lead, Reseller, Reseller contact, Distributor, Distributor contact, Last Testing Date, Expected Closing, How was NBR discovered?, Wufoo Hash, Marketing source, End Support Date, First Invoice, First Invoice Date, Industry, Business Size, Exhibitor, Deal Elements, Missing Functionality, IP and Investment are all empty
 *    - Phone and Mobile are the exception: pre-production prints the literal string "false" in them
 *
 *  Expected values are GROUNDED on the live pre-production Opportunity form (2026-09-21) - they
 *  were read off a freshly created Opportunity, not taken from the Odoo metadata.
 *
 *  Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep the records
 *  they create, exactly like the two baseline Opportunity specs: there is no teardown.
 * =============================================================================================
 */

const TC = 'TC.Performance.1.1.2.29';

/**
 * The information-area fields a newly created Opportunity leaves empty (pre-production, 2026-09-21).
 * Phone and Mobile are deliberately NOT in this list: pre-production renders the literal string
 * "false" in them, which this test case pins separately rather than hiding.
 */
const SHOULD_BE_EMPTY = [
  { field: 'email_cc', label: 'Email CC' },
  { field: 'linkedin', label: 'Linkedin' },
  { field: 'x_studio_source_country_lead', label: 'Country Lead' },
  { field: 'reseller_id', label: 'Reseller' },
  { field: 'reseller_contact_id', label: 'Reseller contact' },
  { field: 'distributor_id', label: 'Distributor' },
  { field: 'distributor_contact_id', label: 'Distributor contact' },
  { field: 'last_testing_date', label: 'Last Testing Date' },
  { field: 'date_deadline', label: 'Expected Closing' },
  { field: 'how_was_NBR_discovered', label: 'How was NBR discovered?' },
  { field: 'wufoo_hash', label: 'Wufoo Hash' },
  { field: 'marketing_source_id', label: 'Marketing source' },
  { field: 'x_studio_end_support_date', label: 'End Support Date' },
  { field: 'first_invoice_id', label: 'First Invoice' },
  { field: 'first_invoice_date', label: 'First Invoice Date' },
  { field: 'business_industry', label: 'Industry' },
  { field: 'business_size', label: 'Business Size' },
  { field: 'exhibitor_id', label: 'Exhibitor' },
  { field: 'x_studio_deal_elements', label: 'Deal Elements' },
  { field: 'x_studio_missing_functionality', label: 'Missing Functionality' },
  { field: 'x_studio_ip_lead_source', label: 'IP' },
  { field: 'activity_id', label: 'Investment' },
];

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  pre1: 'Pre-condition 1: Logging in to NAKIVO Partner Portal with the CRM admin account',
  s1: 'Step 1: Go to CRM > Opportunities (list view) and click CREATE',
  s2: 'Step 2: Fill the Opportunity form:',
  s3: 'Step 3: Click SAVE and wait until Odoo has created the Company from the e-mail domain',
  s4: 'Step 4: Read the fields of the information area that were never filled',
};

test.describe(`${TC} - Empty fields`, () => {
  let oppUrl = '';

  test.beforeEach(async ({ context }) => {
    oppUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - start`).catch(() => {});
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    if (oppUrl) console.log(`Opportunity created by this run: ${oppUrl}`);
    await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - afterEach - teardown done`).catch(() => {});
  });

  test(`${TC}: Verify the Opportunity information fields that stay empty on a newly created Opportunity`, async ({ page }, testInfo) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const opportunityPage = new OpportunityPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      oppName: `AUTO ${TC} ${unique}`,
      contactName: `Contact Name ${TC}`,
      email: `Test-Opp@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Connecticut',
      leadForm: 'License',
    };
    /** The Company Odoo creates out of the e-mail domain. */
    const expectedCompany = `company${unique}.com`;
    let oppId = '';

    // The VERIFY block printed in the last step - filled by record(), printed before the expect()s
    // so it also reaches stdout when a check fails.
    const CHECKS: Array<{ what: string; expected: string; actual: string; pass: boolean }> = [];
    const record = (what: string, expected: unknown, actual: unknown, pass?: boolean) => {
      const expectedText = String(expected);
      const actualText = String(actual);
      CHECKS.push({
        what,
        expected: expectedText,
        actual: actualText,
        pass: pass === undefined ? expectedText === actualText : pass,
      });
    };
    const printVerify = () => {
      console.log('==================== VERIFY ====================');
      CHECKS.forEach((c, i) => {
        console.log(`  Verify #${i + 1} - ${c.what}:`);
        console.log(`     Expected : ${c.expected}`);
        console.log(`     Actual   : ${c.actual}`);
        console.log(`     Result   : ${c.pass ? 'PASS' : 'FAIL'}`);
      });
      console.log('===============================================');
      const passed = CHECKS.filter((c) => c.pass).length;
      console.log(
        `OVERALL: ${passed === CHECKS.length ? 'PASS' : 'FAIL'} - ${passed}/${CHECKS.length} checks matched`
      );
    };

    await test.step(STEP.pre1, async () => {
      console.log(`\n--- ${STEP.pre1} ---`);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step(STEP.s1, async () => {
      console.log(`\n--- ${STEP.s1} ---`);
      await homePage.navigateToCRM();
      await opportunityPage.switchToListView();
      await opportunityPage.clickCreate();
    });

    await test.step(STEP.s2, async () => {
      console.log(`\n--- ${STEP.s2} ---`);
      await opportunityPage.fillOpportunityName(DATA.oppName);
      await opportunityPage.fillContactName(DATA.contactName);
      await opportunityPage.fillEmail(DATA.email);
      await opportunityPage.fillStreet(DATA.street);
      await opportunityPage.selectCountry(DATA.country);
      await opportunityPage.selectState(DATA.state);
      await opportunityPage.clearSalesTeam();
      await opportunityPage.clearSalesperson();
      await opportunityPage.uncheckCreatedManually();
      await opportunityPage.clickCRMDeveloperTab();
      await opportunityPage.fillLeadForm(DATA.leadForm);
      console.log(`  - Opportunity     : ${DATA.oppName}`);
      console.log(`  - Contact Name    : ${DATA.contactName}`);
      console.log(`  - Email           : ${DATA.email}`);
      console.log(`  - Street          : ${DATA.street}`);
      console.log(`  - Country         : ${DATA.country}`);
      console.log(`  - State           : ${DATA.state}`);
      console.log(`  - Sales Team      : cleared`);
      console.log(`  - Salesperson     : cleared`);
      console.log(`  - Create manually : unchecked`);
      console.log(`  - Lead Form       : ${DATA.leadForm}`);
    });

    await test.step(STEP.s3, async () => {
      console.log(`\n--- ${STEP.s3} ---`);
      await opportunityPage.saveAndWaitForCompletion();
      await opportunityPage.waitForContactFieldPopulated('company', 5, 20000);
      oppUrl = page.url();
      oppId = (oppUrl.match(/id=(\d+)/) || [])[1] || '';
      console.log(`  Opportunity saved: ${oppUrl}`);
      console.log(`  Opportunity id   : ${oppId}`);
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - Opportunity created`);
      expect(oppId, 'the Opportunity must have been saved and carry an id').not.toBe('');
    });

    await test.step(STEP.s4, async () => {
      console.log(`\n--- ${STEP.s4} ---`);

      const nonEmpty: string[] = [];
      for (const item of SHOULD_BE_EMPTY) {
        const actual = await opportunityPage.getFieldDisplayValue(item.field);
        console.log(`  ${item.label.padEnd(24)}: "${actual}"`);
        if (actual !== '') nonEmpty.push(`${item.label}="${actual}"`);
        record(`${item.label} is empty on a new Opportunity`, '', actual);
      }
      const phone = await opportunityPage.getFieldDisplayValue('phone');
      const mobile = await opportunityPage.getFieldDisplayValue('mobile');
      console.log(`  Phone                   : "${phone}"`);
      console.log(`  Mobile                  : "${mobile}"`);
      record('Phone renders the literal string "false" when it was never filled', 'false', phone);
      record('Mobile renders the literal string "false" when it was never filled', 'false', mobile);
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - verification done`);

      expect(nonEmpty, 'the information-area fields that must stay empty on a new Opportunity').toEqual([]);
      expect(phone, 'Phone, which pre-production renders as the literal string "false"').toBe('false');
      expect(mobile, 'Mobile, which pre-production renders as the literal string "false"').toBe('false');
    });
  });
});
