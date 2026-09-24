import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { HomePage, LoginPage, OpportunityPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * =============================================================================================
 *  Opportunity screen verification - Buttons
 * =============================================================================================
 *  Test Case ID    : TC.Performance.2.2.2
 *  Jira            : (authored with the batch - the Xray issue is created after the first green run)
 *  Automation-Type : new
 *  Automation-Date : 2026-09-21
 *  Feature folder  : tests/1.Project_CRM/1.SalesReport_Performance/2.Opportunity/2.2.Buttons
 *
 *  Summary
 *  ---------------------------------------------------------------------------------------------
 *  The spec creates its own Opportunity on pre-production, tagged with the run token <unique>
 *  (a timestamp) so the record can always be found again, and then asserts the ONE aspect this
 *  test case owns: verify that a saved Opportunity offers exactly the expected header buttons, in the expected screen order (row by row, then left to right), and that the buttons bound to a python method call the expected action.
 *
 *  Command to run
 *  ---------------------------------------------------------------------------------------------
 *  npx playwright test --grep "TC\\.Performance\\.2\\.2\\.2:" --project=SalesReport_Performance
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
 *       - Opportunity     = AUTO TC.Performance.2.2.2 <unique>
 *       - Contact Name    = Contact Name TC.Performance.2.2.2
 *       - Email           = Test-Opp@company<unique>.com
 *       - Street          = 123street
 *       - Country         = United States
 *       - State           = Connecticut
 *       - Sales Team      = cleared
 *       - Salesperson     = cleared
 *       - Create manually = unchecked
 *       - Lead Form (CRM Developer tab) = License
 *    3. Click SAVE and wait until Odoo has created the Company from the e-mail domain
 *    4. Read the header buttons of the saved Opportunity
 *
 *  Verification:
 *    4. The header shows exactly 9 buttons, in this screen order:
 *    - row 1: DEAL ELEMENT | MARK WON | MARK LOST | NEW DEMO | REQUEST SE SUPPORT
 *    - row 2: MARK HOTSITE | LOG CALL | LOG POSITIVE REPLY | LOG 1-1 MEETING
 *    - DEAL ELEMENT calls action_create_deal_element, MARK WON calls action_set_won_rainbowman, MARK HOTSITE calls action_enable_hot_site_concept, LOG CALL calls log_call, LOG POSITIVE REPLY calls log_positive_reply and LOG 1-1 MEETING calls log_11
 *    - The buttons Odoo hides on a new Opportunity (New Quotation, APPROVE, REJECT, ...) are NOT shown
 *
 *  Expected values are GROUNDED on the live pre-production Opportunity form (2026-09-21) - they
 *  were read off a freshly created Opportunity, not taken from the Odoo metadata.
 *
 *  Pre-production is the team's test bed and the 1.SalesReport_Performance specs keep the records
 *  they create, exactly like the two baseline Opportunity specs: there is no teardown.
 * =============================================================================================
 */

const TC = 'TC.Performance.2.2.2';

/**
 * The header buttons a saved Opportunity shows, in screen order - the bar WRAPS onto a second row
 * at 1920x1080, so the order below is row 1 left-to-right followed by row 2 left-to-right.
 * Grounded on pre-production, 2026-09-21.
 */
const EXPECTED_LABELS = [
    'DEAL ELEMENT',
    'MARK WON',
    'MARK LOST',
    'NEW DEMO',
    'REQUEST SE SUPPORT',
    'MARK HOTSITE',
    'LOG CALL',
    'LOG POSITIVE REPLY',
    'LOG 1-1 MEETING',
  ];

/**
 * The Odoo action behind each header button that is bound to a PYTHON METHOD. MARK LOST, NEW DEMO
 * and REQUEST SE SUPPORT are bound to an ir.actions RECORD instead, so their name attribute is a
 * database id ("136", "717", "1014") that differs from one database to the next - those three are
 * asserted on their caption only.
 */
const EXPECTED_ACTIONS: Record<string, string> = {
  'DEAL ELEMENT': 'action_create_deal_element',
  'MARK WON': 'action_set_won_rainbowman',
  'MARK HOTSITE': 'action_enable_hot_site_concept',
  'LOG CALL': 'log_call',
  'LOG POSITIVE REPLY': 'log_positive_reply',
  'LOG 1-1 MEETING': 'log_11',
};

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  pre1: 'Pre-condition 1: Logging in to NAKIVO Partner Portal with the CRM admin account',
  s1: 'Step 1: Go to CRM > Opportunities (list view) and click CREATE',
  s2: 'Step 2: Fill the Opportunity form:',
  s3: 'Step 3: Click SAVE and wait until Odoo has created the Company from the e-mail domain',
  s4: 'Step 4: Read the header buttons of the saved Opportunity',
};

test.describe(`${TC} - Buttons`, () => {
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

  test(`${TC}: Verify the number, the names and the order of the header buttons on a saved Opportunity`, async ({ page }, testInfo) => {
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

      const map = await opportunityPage.getStatusbarButtonMap();
      const actual = map.map((b) => b.label);
      actual.forEach((label, i) => console.log(`  Header button #${i + 1}: ${label} (name="${map[i].name}")`));
      record('Number of header buttons', EXPECTED_LABELS.length, actual.length);
      record('Header buttons and their order', EXPECTED_LABELS.join(' | '), actual.join(' | '));
      Object.keys(EXPECTED_ACTIONS).forEach((label) => {
        const hit = map.find((b) => b.label === label);
        record(`The action the button "${label}" calls`, EXPECTED_ACTIONS[label], hit ? hit.name : '(button not shown)');
      });
      printVerify();
      await CommonUtils.captureAndAttachScreenshot(page, testInfo, `${TC} - verification done`);

      expect(actual.length, 'the NUMBER of header buttons on a saved Opportunity').toBe(EXPECTED_LABELS.length);
      expect(actual, 'the header button NAMES and their ORDER').toEqual(EXPECTED_LABELS);
      Object.keys(EXPECTED_ACTIONS).forEach((label) => {
        const hit = map.find((b) => b.label === label);
        expect(hit ? hit.name : '(button not shown)', `the action the button "${label}" calls`).toBe(EXPECTED_ACTIONS[label]);
      });
    });
  });
});
