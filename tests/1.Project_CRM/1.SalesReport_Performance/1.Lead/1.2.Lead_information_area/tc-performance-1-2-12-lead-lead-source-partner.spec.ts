import { test, expect } from '@playwright/test';
import { users, baseUrl } from '@config/users.config';
import { config } from '@config/test.config';
import { LoginPage, HomePage, LeadPage } from '@pages';
import { CommonUtils } from '@helpers/common.utils';

/**
 * Lead data verification - Lead Source - Partner (Lead created with an owner)
 * Test Case ID: TC.Performance.1.2.12
 *
 * Command to run:
 * npx playwright test --grep "TC\\.Performance\\.1\\.1\\.1\\.14:" --project=SalesReport_Performance
 *
 * Objective: Verify a Lead created with a Sales Team and a Salesperson is classified Lead Source = Partner
 *
 * The spec creates its own fresh Lead on pre-production, marked with the run token
 * <unique> (a timestamp) so the record can always be found again, then re-reads the
 * saved form and asserts the one aspect this test case owns.
 */

const TC = 'TC.Performance.1.2.12';

// One source of truth: the stdout banner and the test.step label are the same string.
const STEP = {
  s1: 'Step 1: Logging in to NAKIVO Partner Portal',
  s2: 'Step 2: Navigating to CRM > Leads',
  s3: 'Step 3: Clicking CREATE and filling the Lead form',
  s4: 'Step 4: Saving the Lead',
  s5: 'Step 5: Verifying the Lead Source derived for a Lead created with an owner',
};

test.describe(`${TC} - Lead Source - Partner (Lead created with an owner)`, () => {
  // Pre-production is the team's test bed and the specs in this folder keep the
  // Leads they create (same convention as the performance specs) - no teardown.
  let leadUrl = '';

  test.beforeEach(async ({ context }) => {
    leadUrl = '';
    await context.clearCookies();
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed' || testInfo.status === 'timedOut') {
      const reason = testInfo.error?.message?.split('\n').slice(0, 8).join('\n').trim();
      if (reason) {
        console.log('TEST FAILED - reason:');
        console.log(`   ${reason.replace(/\n/g, '\n   ')}`);
      }
      await page
        .locator('.o_loading, .oe_loading, [class*="loading"]')
        .waitFor({ state: 'hidden', timeout: 5000 })
        .catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(CommonUtils.waitTimes.extraLong);
    }
    if (leadUrl) console.log(`Lead created by this run: ${leadUrl}`);
  });

  test(`${TC}: Verify a Lead created with a Sales Team and a Salesperson is classified Lead Source = Partner`, async ({ page }) => {
    test.setTimeout(CommonUtils.waitTimes.runningTestScript);
    await page.setViewportSize({ width: 1920, height: 1080 });

    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);
    const leadPage = new LeadPage(page);

    const unique = `${Date.now()}`;
    const DATA = {
      opportunity: `AUTO ${TC} ${unique}`,
      companyName: `TEST-Contact ${TC} ${unique}`,
      contactName: `Contact Name ${TC}`,
      email: `Test-Company@company${unique}.com`,
      street: '123street',
      country: 'United States',
      state: 'Texas',
      leadForm: 'Download Free Trial',
      leadSource: '',
    };
    // Proven-valid pair on pre-production; a Lead created WITH an owner keeps type=lead.
    const OWNER = { team: 'CMR', salesperson: 'Sergio Yalovik' };

    await test.step(STEP.s1, async () => {
      console.log(STEP.s1);
      await loginPage.navigateTo(baseUrl);
      await loginPage.login(users.admin_crm.username, users.admin_crm.password);
      await loginPage.dismissLocationPermissionDialog();
    });

    await test.step(STEP.s2, async () => {
      console.log(STEP.s2);
      await homePage.navigateToCRM();
      await homePage.navigateToLeads();
    });

    await test.step(STEP.s3, async () => {
      console.log(STEP.s3);
      await leadPage.clickCreate();
      await leadPage.waitForLeadFormToLoad();

      await leadPage.fillLeadOpportunity(DATA.opportunity);
      await leadPage.fillCompanyName(DATA.companyName);
      await leadPage.fillContactName(DATA.contactName);
      await leadPage.fillEmail(DATA.email);
      await leadPage.fillStreet(DATA.street);
      await leadPage.selectCountry(DATA.country);
      await leadPage.selectState(DATA.state);
      await leadPage.selectSalesTeam(OWNER.team);
      await leadPage.selectSalesperson(OWNER.salesperson);
      await leadPage.uncheckCreatedManually();
      await leadPage.clickCRMDeveloperTab();
      await leadPage.fillLeadForm(DATA.leadForm);
      await leadPage.clickMainTabToExitCRMDeveloper();

      console.log(`  - Opportunity  : ${DATA.opportunity}`);
      console.log(`  - Company Name : ${DATA.companyName}`);
      console.log(`  - Contact Name : ${DATA.contactName || '(left empty)'}`);
      console.log(`  - Email        : ${DATA.email}`);
      console.log(`  - Address      : ${DATA.street} / ${DATA.state || '(none)'} / ${DATA.country}`);
      console.log(`  - Lead Form    : ${DATA.leadForm}`);
      console.log(`  - Lead Source  : ${DATA.leadSource || '(left empty)'}`);
    });

    await test.step(STEP.s4, async () => {
      console.log(STEP.s4);
      await leadPage.clickSave();
      await leadPage.waitForRecordSaved();
      leadUrl = page.url();
      console.log(`  Lead saved: ${leadUrl}`);
    });

    await test.step(STEP.s5, async () => {
      console.log(STEP.s5);
      const leadSource = await leadPage.getLeadSourceValue();
      const salesTeam = await leadPage.readFieldValue('team_id');
      const salesperson = await leadPage.readFieldValue('user_id');
      const sourceNote = await leadPage.findChatterMessage(/^Lead Source:/);
      console.log('VERIFY - Lead Source of a Lead created WITH an owner');
      console.log(`  Sales Team  : expected "${OWNER.team}" | actual "${salesTeam}"`);
      console.log(`  Salesperson : expected "${OWNER.salesperson}" | actual "${salesperson}"`);
      console.log(`  Lead Source : expected "Partner" | actual "${leadSource}"`);
      console.log(`  Lead Source tracking note : ${sourceNote ? sourceNote.replace(/\n/g, ' | ') : '(none - expected)'}`);
      expect(salesTeam, 'the Sales Team entered at creation must be kept').toBe(OWNER.team);
      expect(salesperson, 'the Salesperson entered at creation must be kept').toBe(OWNER.salesperson);
      expect(leadSource, 'a Lead created with an owner must be classified Partner').toBe('Partner');
      expect(
        sourceNote,
        'the value is derived at creation, so no Lead Source change may be logged'
      ).toBeNull();
    });
  });
});
