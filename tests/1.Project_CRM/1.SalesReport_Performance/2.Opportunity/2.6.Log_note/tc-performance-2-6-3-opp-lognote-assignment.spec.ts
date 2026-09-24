import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  Opportunity screen verification - Log note
 * =============================================================================================
 *  Test Case ID    : TC.Performance.2.6.3
 *  Jira            : (authored with the batch - the Xray issue is created after the first green run)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-21
 *  Feature folder  : tests/1.Project_CRM/1.SalesReport_Performance/2.Opportunity/2.6.Log_note
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The spec creates its own Opportunity on pre-production, tagged with the run token <unique>
 *  (a timestamp) so the record can always be found again, and then asserts the ONE aspect this
 *  test case owns: verify that the assignment job writes its result into the chatter: one log note naming the Salesperson it picked and that user e-mail, and one naming the Sales Team and the Lead Source.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "TC\\.Performance\\.2\\.6\\.3:" --project=SalesReport_Performance
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
 *       - Opportunity     = AUTO TC.Performance.2.6.3 <unique>
 *       - Contact Name    = Contact Name TC.Performance.2.6.3
 *       - Email           = Test-Opp@company<unique>.com
 *       - Street          = 123street
 *       - Country         = United States
 *       - State           = Connecticut
 *       - Sales Team      = cleared
 *       - Salesperson     = cleared
 *       - Create manually = unchecked
 *       - Lead Form (CRM Developer tab) = License
 *    3. Click SAVE and wait until Odoo has created the Company from the e-mail domain
 *    4. Read the assignment log notes in the chatter
 *
 *  Verification:
 *    4. The chatter carries the two log notes the assignment job writes:
 *    - A note starting with "Salesperson:" reporting Salesperson = Thomas Semerich and User Email = thomas.semerich@nakivo.com
 *    - A note starting with "Sales Team:" reporting Sales Team = BDEU, Lead Source = Nakivo and Lead Source Technical = Nakivo
 *
 *  Expected values are GROUNDED on the live pre-production Opportunity form (2026-09-21) - they
 *  were read off a freshly created Opportunity, not taken from the Odoo metadata.
 *
 *  Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep the records
 *  they create, exactly like the two baseline Opportunity specs: there is no teardown.
 * =============================================================================================
 */

const TC = 'TC.Performance.2.6.3';

const EXPECTED_SALESPERSON = 'Thomas Semerich';
const EXPECTED_USER_EMAIL = 'thomas.semerich@nakivo.com';
const EXPECTED_TEAM = 'BDEU';
const EXPECTED_SOURCE = 'Nakivo';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  pre1: 'Pre-condition 1: Logging in to NAKIVO Partner Portal with the CRM admin account',
  s1: 'Step 1: Go to CRM > Opportunities (list view) and click CREATE',
  s2: 'Step 2: Fill the Opportunity form:',
  s3: 'Step 3: Click SAVE and wait until Odoo has created the Company from the e-mail domain',
  s4: 'Step 4: Read the assignment log notes in the chatter',
};

test.describe(`${TC} - Log note`, () => {
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

  test(`${TC}: Verify the assignment log notes report the Salesperson, the Sales Team and the Lead Source`, async ({ page }, testInfo) => {
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

      const salespersonNote = await opportunityPage.waitForChatterMessage(/^Salesperson: /);
      const teamNote = await opportunityPage.waitForChatterMessage(/^Sales Team: /);
      console.log('  The Salesperson log note:');
      console.log(`${(salespersonNote || '(not found)').split('\n').map((l) => '    ' + l).join('\n')}`);
      console.log('  The Sales Team log note:');
      console.log(`${(teamNote || '(not found)').split('\n').map((l) => '    ' + l).join('\n')}`);
      record('The chatter carries a Salesperson log note', 'FOUND', salespersonNote ? 'FOUND' : 'NOT FOUND');
      record('The chatter carries a Sales Team log note', 'FOUND', teamNote ? 'FOUND' : 'NOT FOUND');
      const spFields = salespersonNote ? opportunityPage.parseLogNoteFields(salespersonNote) : {};
      const teamFields = teamNote ? opportunityPage.parseLogNoteFields(teamNote) : {};
      record('Salesperson reported by the log note', EXPECTED_SALESPERSON, spFields['Salesperson'] ?? '(missing)');
      record('User Email reported by the log note', EXPECTED_USER_EMAIL, spFields['User Email'] ?? '(missing)');
      record('Sales Team reported by the log note', EXPECTED_TEAM, teamFields['Sales Team'] ?? '(missing)');
      record('Lead Source reported by the log note', EXPECTED_SOURCE, teamFields['Lead Source'] ?? '(missing)');
      record('Lead Source Technical reported by the log note', EXPECTED_SOURCE, teamFields['Lead Source Technical'] ?? '(missing)');
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - verification done`);

      expect(salespersonNote, 'the chatter must carry a Salesperson log note').not.toBeNull();
      expect(teamNote, 'the chatter must carry a Sales Team log note').not.toBeNull();
      expect(spFields['Salesperson'], 'the Salesperson the log note reports').toBe(EXPECTED_SALESPERSON);
      expect(spFields['User Email'], 'the user e-mail the log note reports').toBe(EXPECTED_USER_EMAIL);
      expect(teamFields['Sales Team'], 'the Sales Team the log note reports').toBe(EXPECTED_TEAM);
      expect(teamFields['Lead Source'], 'the Lead Source the log note reports').toBe(EXPECTED_SOURCE);
      expect(teamFields['Lead Source Technical'], 'the technical Lead Source the log note reports').toBe(EXPECTED_SOURCE);
    });
  });
});
